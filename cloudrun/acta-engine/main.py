import base64
import io
import os
import re
from typing import Optional

import fitz
from flask import Flask, jsonify, request
from PIL import Image
from pyzbar.pyzbar import decode

app = Flask(__name__)

ENGINE_TOKEN = os.getenv("ENGINE_TOKEN", "").strip()


def normalize_acta(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) < 7:
        return ""
    if digits.startswith("000"):
        return ""
    if re.fullmatch(r"0+", digits):
        return ""
    if re.fullmatch(r"0+", digits[3:]):
        return ""
    return f"{digits[:3]}-{digits[3:]}"


def decode_barcode(image: Image.Image) -> str:
    try:
        hits = decode(image)
    except Exception:
        hits = []
    for hit in hits:
        value = hit.data.decode("utf-8", errors="ignore")
        acta = normalize_acta(value)
        if acta:
            return acta
    return ""


def first_page_png(pdf_bytes: bytes, zoom: float = 2.6) -> Image.Image:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc.load_page(0)
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png")))


def read_acta_from_pdf(pdf_bytes: bytes) -> str:
    image = first_page_png(pdf_bytes)
    width, height = image.size

    rois = [
        (int(width * 0.54), 0, width, int(height * 0.35)),
        (int(width * 0.46), 0, width, int(height * 0.50)),
        (int(width * 0.32), 0, width, int(height * 0.58)),
    ]

    for box in rois:
        crop = image.crop(box)
        acta = decode_barcode(crop)
        if acta:
            return acta

    full_page = decode_barcode(image)
    if full_page:
        return full_page
    return ""


def require_auth() -> Optional[tuple]:
    if not ENGINE_TOKEN:
        return None
    auth = request.headers.get("Authorization", "").strip()
    expected = f"Bearer {ENGINE_TOKEN}"
    if auth != expected:
        return jsonify({"ok": False, "message": "UNAUTHORIZED"}), 401
    return None


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "acta-engine"})


@app.post("/extract")
def extract():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    b64 = str(payload.get("pdfBase64") or "").strip()
    if not b64:
        return jsonify({"ok": True, "acta": None, "detail": "PDF_BASE64_REQUIRED"}), 200

    try:
        pdf_bytes = base64.b64decode(b64)
    except Exception:
        return jsonify({"ok": True, "acta": None, "detail": "PDF_BASE64_INVALID"}), 200

    try:
        acta = read_acta_from_pdf(pdf_bytes)
        if acta:
            return jsonify({"ok": True, "acta": acta, "detail": "DETECTED"}), 200
        return jsonify({"ok": True, "acta": None, "detail": "NO_MATCH"}), 200
    except Exception as exc:
        return jsonify({"ok": False, "message": f"ENGINE_FAILURE: {exc}"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
