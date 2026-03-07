import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const SHEET_MISSING = "Clientes faltantes";
const SHEET_CAT5 = "CAT5e";
const SHEET_CAT6 = "CAT6";

const FILL_YELLOW = { patternType: "solid", fgColor: { rgb: "FFFDE047" } };
const FILL_ORANGE = { patternType: "solid", fgColor: { rgb: "FFFED7AA" } };

type InstLite = {
  id: string;
  codigoCliente: string;
  fechaInstalacionYmd: string;
  tipoServicio: string;
  cliente: string;
  documento: string;
  direccion: string;
  tipoOrden: string;
  plan: string;
  snONT: string;
  snMESH: string[];
  snBOX: string[];
  snFONO: string;
  acta: string;
  metrajeInstalado: string;
  cableadoMesh: string;
  rotuloNapCto: string;
  partner: string;
  provincia: string;
  nombrePartida: string;
  planGamer: string;
  kitWifiPro: string;
  servicioCableadoMesh: string;
  cat5e: number;
  cat6: number;
  observacion: string;
  proidONT: string;
};

type Summary = {
  totalExcelRows: number;
  matchedRows: number;
  notFoundInDbRows: number;
  modifiedRows: number;
  modifiedCells: number;
  filledActaMetrajeNoHighlight: number;
  missingClientes: number;
  cat5eRows: number;
  cat6Rows: number;
  cantidadInstalaciones: number;
  totalResidenciales: number;
  totalCondominio: number;
  totalOntInstalados: number;
  totalMeshInstalados: number;
  totalFonoInstalados: number;
  totalBoxInstalados: number;
  cat5ePunto1: number;
  cat5ePunto2: number;
  cat5ePunto3: number;
  cat5ePunto4: number;
  totalCat5ePuntos: number;
  totalCat6PlanGamer: number;
};

function normHeader(v: unknown) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normValue(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function pickHeader(headers: string[], aliases: string[]) {
  const target = new Set(aliases.map((x) => normHeader(x)));
  return headers.find((h) => target.has(normHeader(h))) || "";
}

function toStr(v: unknown) {
  return String(v ?? "").trim();
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseSnList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => toStr(x)).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => toStr(x)).filter(Boolean);
    } catch {}
    return s.split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  if (typeof v === "string") return v;
  return null;
}

function mergeFillStyle(cell: any, fill: any) {
  const next = cell || {};
  const s = typeof next.s === "object" && next.s ? next.s : {};
  next.s = { ...s, fill };
  return next;
}

function setCell(ws: XLSX.WorkSheet, row1: number, col0: number, value: any) {
  const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
  const old = ws[addr] || {};
  if (typeof value === "number" && Number.isFinite(value)) {
    ws[addr] = { ...old, t: "n", v: value };
  } else {
    ws[addr] = { ...old, t: "s", v: String(value ?? "") };
  }
}

function getCellRaw(ws: XLSX.WorkSheet, row1: number, col0: number) {
  const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
  return ws[addr]?.v ?? "";
}

function applyCellFill(ws: XLSX.WorkSheet, row1: number, col0: number, fill: any) {
  const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
  ws[addr] = mergeFillStyle(ws[addr], fill);
}

function excelSerialToYmd(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return "";
  let yy = Number(m[3]);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  return `${yy}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

function ymdToMdy2(ymd: string) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(-2)}`;
}

function mapInstDoc(d: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): InstLite {
  const data = (d.data() || {}) as any;
  const orden = data.orden || {};
  const liquidacion = data.liquidacion || {};
  const serviciosRaw =
    data.servicios && typeof data.servicios === "object" && !Array.isArray(data.servicios)
      ? data.servicios
      : {};
  const liquidacionServicios =
    liquidacion.servicios && typeof liquidacion.servicios === "object" && !Array.isArray(liquidacion.servicios)
      ? liquidacion.servicios
      : {};
  const servicios = { ...liquidacionServicios, ...serviciosRaw };

  const equiposRaw =
    (Array.isArray(data.equiposInstalados) && data.equiposInstalados) ||
    (Array.isArray(liquidacion.equiposInstalados) && liquidacion.equiposInstalados) ||
    (Array.isArray((orden as any)?.equiposInstalados) && (orden as any).equiposInstalados) ||
    [];
  const equipos = equiposRaw
    .map((e: any) => ({
      sn: toStr(e?.sn || e?.SN),
      tipo: toStr(e?.tipo || e?.kind).toUpperCase(),
      proid: toStr(e?.proid || e?.PROID),
    }))
    .filter((e: any) => e.sn || e.tipo || e.proid);

  const byTipo = (tipo: string) => equipos.filter((e: any) => e.tipo.includes(tipo));
  const snMESH = byTipo("MESH").map((e: any) => e.sn).filter(Boolean);
  const snBOX = byTipo("BOX").map((e: any) => e.sn).filter(Boolean);

  const planValue = Array.isArray(data.plan)
    ? data.plan.join(" | ")
    : toStr(data.plan || orden.plan || orden.idenServi);

  const cableado = toStr(servicios.servicioCableadoMesh || "");

  return {
    id: d.id,
    codigoCliente: toStr(data.codigoCliente || orden.codiSeguiClien || d.id),
    fechaInstalacionYmd: toStr(data.fechaInstalacionYmd || orden.fechaFinVisiYmd || orden.fSoliYmd || ""),
    tipoServicio: "PAGO POR UNIDAD",
    cliente: toStr(data.cliente || orden.cliente || ""),
    documento: toStr(data.documento || orden.numeroDocumento || ""),
    direccion: toStr(data.direccion || orden.direccion || ""),
    tipoOrden: toStr(data.tipoOrden || orden.tipoOrden || orden.tipo || data.tipo || ""),
    plan: planValue,
    snONT: toStr(byTipo("ONT")[0]?.sn || data.snONT || ""),
    snMESH: snMESH.length ? snMESH : parseSnList(data.snMESH),
    snBOX: snBOX.length ? snBOX : parseSnList(data.snBOX),
    snFONO: toStr(byTipo("FONO")[0]?.sn || data.snFONO || ""),
    acta: toStr(data.ACTA || data.acta || data.materialesLiquidacion?.acta || ""),
    metrajeInstalado: toStr(data.metraje_instalado || data.metrajeInstalado || data.materialesLiquidacion?.bobinaMetros || ""),
    cableadoMesh: cableado || "NO LLEVA",
    rotuloNapCto: toStr(liquidacion.rotuloNapCto || data.rotuloNapCto || ""),
    partner: "M&D",
    provincia: "LIMA",
    nombrePartida: toStr(data.nombrePartida || orden.nombrePartida || data.partida || orden.partida || "Ultima Milla"),
    planGamer: toStr(servicios.planGamer || ""),
    kitWifiPro: toStr(servicios.kitWifiPro || ""),
    servicioCableadoMesh: toStr(servicios.servicioCableadoMesh || ""),
    cat5e: toNum(servicios.cat5e),
    cat6: toNum(servicios.cat6),
    observacion: toStr(liquidacion.observacion || data.observacion || ""),
    proidONT: toStr(byTipo("ONT")[0]?.proid || data.proidONT || data.proid || ""),
  };
}

function obsContrataFromInst(inst: InstLite) {
  const cat5 = toNum(inst.cat5e);
  const cat6 = toNum(inst.cat6);
  const puntos = cat5 + cat6;

  const planTxt = toStr(inst.planGamer);
  const kitTxt = toStr(inst.kitWifiPro);
  const esGamer = planTxt.toUpperCase() === "GAMER" || planTxt.toUpperCase().includes("GAMER");
  const esKit = kitTxt.toUpperCase() === "KIT WIFI PRO (AL CONTADO)";

  let obs = "";
  if (cat5 > 0) {
    const extras: string[] = [];
    if (esGamer) extras.push("Se realizo Plan Gamer Cat.6");
    if (esKit) extras.push("KIT WIFI PRO");
    obs = `Se realizo ${cat5} Cableado UTP Cat.5e${extras.length ? ` + ${extras.join(" + ")}` : ""}`;
  } else {
    const extras: string[] = [];
    if (esGamer) extras.push("Se realizo Plan Gamer Cat.6");
    if (esKit) extras.push("KIT WIFI PRO");
    obs = extras.join(" + ");
  }

  const cableadoUtpMts = puntos > 0 ? puntos * 25 : "";
  return { obs, cableadoUtpMts, puntos, cat5, cat6 };
}

function buildOriginalFormatRow(inst: InstLite, originalHeaders: string[]) {
  const out: Record<string, any> = {};
  const vals: Record<string, any> = {
    "Fecha de Instalación": ymdToMdy2(inst.fechaInstalacionYmd),
    "Tipo de Servicio": inst.tipoServicio || "PAGO POR UNIDAD",
    "Nombre de Partida": inst.nombrePartida || "Ultima Milla",
    "N° Acta": inst.acta,
    "Código de Pedido": inst.codigoCliente,
    DNI: inst.documento,
    Cliente: inst.cliente,
    Dirección: inst.direccion,
    "Condominio o Residencial": inst.tipoOrden,
    "Nombre de Condominio o Torre": "",
    "Paquete de servicio": inst.plan,
    SeriedelaONT: inst.snONT,
    "Serie Mesh 1": inst.snMESH[0] || "",
    "Serie Mesh 2": inst.snMESH[1] || "",
    "Serie Mesh 3": inst.snMESH[2] || "",
    "Serie Mesh 4": inst.snMESH[3] || "",
    "Serie Win Box 1": inst.snBOX[0] || "",
    "Serie Win Box 2": inst.snBOX[1] || "",
    "Serie Win Box 3": inst.snBOX[2] || "",
    "Win Phone": inst.snFONO,
    Metraje: inst.metrajeInstalado,
    "Cableado Mesh": inst.cableadoMesh,
    "Rotulado de CTO ó CAJA NAP": inst.rotuloNapCto,
    Partner: inst.partner,
    Provincia: inst.provincia,
  };

  for (const h of originalHeaders) out[h] = vals[h] ?? "";
  return out;
}

function buildSystemExportRow(inst: InstLite, index: number) {
  const snMESH = (inst.snMESH || []).filter(Boolean);
  const snBOX = (inst.snBOX || []).filter(Boolean);
  const cat = obsContrataFromInst(inst);
  const cantidadMesh = [snMESH[0], snMESH[1], snMESH[2], snMESH[3]].filter(Boolean).length;

  return {
    N: index + 1,
    "Fecha Instalacion": ymdToMdy2(inst.fechaInstalacionYmd),
    "Tipo de Servicio": "INSTALACION",
    "Nombre de Partida": inst.nombrePartida || "Ultima Milla",
    Cuadrilla: "",
    Acta: inst.acta || "",
    "Codigo Cliente": inst.codigoCliente || "",
    Documento: inst.documento || "",
    Cliente: inst.cliente || "",
    Direccion: inst.direccion || "",
    "Tipo Orden": inst.tipoOrden || "",
    Plan: inst.plan || "",
    SN_ONT: inst.snONT || "",
    proid: inst.proidONT || "",
    "SN_MESH(1)": snMESH[0] || "",
    "SN_MESH(2)": snMESH[1] || "",
    "SN_MESH(3)": snMESH[2] || "",
    "SN_MESH(4)": snMESH[3] || "",
    "SN_BOX(1)": snBOX[0] || "",
    "SN_BOX(2)": snBOX[1] || "",
    "SN_BOX(3)": snBOX[2] || "",
    "SN_BOX(4)": snBOX[3] || "",
    SN_FONO: inst.snFONO || "",
    metraje_instalado: inst.metrajeInstalado || "",
    "Cantidad mesh": cantidadMesh,
    rotuloNapCto: inst.rotuloNapCto || "",
    "Observacion de la contrata": cat.obs || "",
    "Cableado UTP (MTS)": cat.cableadoUtpMts || "",
    Observacion: inst.observacion || "",
    "Plan Gamer": inst.planGamer || "",
    KitWifiPro: inst.kitWifiPro || "",
    "Servicio Cableado Mesh": inst.servicioCableadoMesh || "",
    Cat5e: cat.cat5 > 0 ? cat.cat5 : "",
    Cat6: cat.cat6 > 0 ? cat.cat6 : "",
    "Puntos UTP": cat.puntos > 0 ? cat.puntos : "",
  };
}

async function loadInstByCodes(codes: string[]) {
  const out = new Map<string, InstLite>();
  const unique = Array.from(new Set(codes.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 400) {
    const part = unique.slice(i, i + 400);
    const refs = part.map((c) => adminDb().collection("instalaciones").doc(c));
    const snaps = await adminDb().getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) out.set(s.id, mapInstDoc(s));
    });
  }
  return out;
}

async function loadInstByDateRange(fromYmd: string, toYmd: string) {
  if (!fromYmd || !toYmd) return [] as InstLite[];
  let q: FirebaseFirestore.Query = adminDb()
    .collection("instalaciones")
    .where("fechaOrdenYmd", ">=", fromYmd)
    .where("fechaOrdenYmd", "<=", toYmd)
    .orderBy("fechaOrdenYmd", "asc")
    .limit(2000);

  const out: InstLite[] = [];
  while (true) {
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((d) => out.push(mapInstDoc(d)));
    if (snap.size < 2000) break;
    q = q.startAfter(snap.docs[snap.docs.length - 1]);
  }
  return out;
}

function replaceOrAppendSheet(wb: XLSX.WorkBook, name: string, ws: XLSX.WorkSheet) {
  if (wb.Sheets[name]) {
    wb.Sheets[name] = ws;
    return;
  }
  wb.Sheets[name] = ws;
  wb.SheetNames.push(name);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isGerencia = session.isAdmin || roles.includes("GERENCIA");
    if (!isGerencia) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellStyles: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return NextResponse.json({ ok: false, error: "SHEET_REQUIRED" }, { status: 400 });
    const ws = wb.Sheets[firstSheetName];
    if (!ws?.["!ref"]) return NextResponse.json({ ok: false, error: "EMPTY_SHEET" }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: true });
    if (!rows.length) return NextResponse.json({ ok: false, error: "NO_ROWS" }, { status: 400 });

    const headers = Object.keys(rows[0]);
    const hPedido = pickHeader(headers, ["Código de Pedido", "Codigo de Pedido"]);
    const hFecha = pickHeader(headers, ["Fecha de Instalación", "Fecha de Instalacion"]);
    const hActa = pickHeader(headers, ["N° Acta", "N Acta"]);
    const hMetraje = pickHeader(headers, ["Metraje"]);
    const hTipoOrden = pickHeader(headers, ["Condominio o Residencial"]);
    const hCableado = pickHeader(headers, ["Cableado Mesh"]);
    const hOnt = pickHeader(headers, ["SeriedelaONT"]);
    const hMesh1 = pickHeader(headers, ["Serie Mesh 1"]);
    const hMesh2 = pickHeader(headers, ["Serie Mesh 2"]);
    const hMesh3 = pickHeader(headers, ["Serie Mesh 3"]);
    const hMesh4 = pickHeader(headers, ["Serie Mesh 4"]);
    const hBox1 = pickHeader(headers, ["Serie Win Box 1"]);
    const hBox2 = pickHeader(headers, ["Serie Win Box 2"]);
    const hBox3 = pickHeader(headers, ["Serie Win Box 3"]);
    const hPhone = pickHeader(headers, ["Win Phone"]);
    const hPartida = pickHeader(headers, ["Nombre de Partida"]);

    if (!hPedido) {
      return NextResponse.json({ ok: false, error: "HEADER_CODIGO_PEDIDO_REQUIRED" }, { status: 400 });
    }

    const range = XLSX.utils.decode_range(ws["!ref"]);
    const colByNorm = new Map<string, number>();
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      const hv = cell?.v;
      if (hv !== undefined && hv !== null) colByNorm.set(normHeader(hv), c);
    }

    const getCol = (h: string) => colByNorm.get(normHeader(h)) ?? -1;

    const excelCodes = rows.map((r) => toStr(r[hPedido])).filter(Boolean);
    const excelCodeSet = new Set(excelCodes);
    const byCode = await loadInstByCodes(excelCodes);

    const fechasYmd = rows
      .map((r) => excelSerialToYmd(r[hFecha]))
      .filter((x) => !!x)
      .sort();
    const fromYmd = fechasYmd[0] || "";
    const toYmd = fechasYmd[fechasYmd.length - 1] || "";
    const monthInst = await loadInstByDateRange(fromYmd, toYmd);
    const summary: Summary = {
      totalExcelRows: rows.length,
      matchedRows: 0,
      notFoundInDbRows: 0,
      modifiedRows: 0,
      modifiedCells: 0,
      filledActaMetrajeNoHighlight: 0,
      missingClientes: 0,
      cat5eRows: 0,
      cat6Rows: 0,
      cantidadInstalaciones: 0,
      totalResidenciales: 0,
      totalCondominio: 0,
      totalOntInstalados: 0,
      totalMeshInstalados: 0,
      totalFonoInstalados: 0,
      totalBoxInstalados: 0,
      cat5ePunto1: 0,
      cat5ePunto2: 0,
      cat5ePunto3: 0,
      cat5ePunto4: 0,
      totalCat5ePuntos: 0,
      totalCat6PlanGamer: 0,
    };

    const changesByRow = new Map<number, number[]>();
    const rowShouldOrange = new Set<number>();

    function applyChange(
      row1: number,
      header: string,
      nextValue: any,
      highlight: boolean,
      countAsSilentFill = true
    ) {
      const col = getCol(header);
      if (col < 0) return;
      const prevRaw = getCellRaw(ws, row1, col);
      const prev = toStr(prevRaw);
      const next = toStr(nextValue);
      if (normValue(prev) === normValue(next)) return;

      setCell(ws, row1, col, nextValue ?? "");
      if (highlight) {
        const arr = changesByRow.get(row1) || [];
        arr.push(col);
        changesByRow.set(row1, arr);
        rowShouldOrange.add(row1);
        summary.modifiedCells += 1;
      } else if (countAsSilentFill) {
        summary.filledActaMetrajeNoHighlight += 1;
      }
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const row1 = i + 2;
      const code = toStr(row[hPedido]);
      if (!code) continue;
      const inst = byCode.get(code);
      if (!inst) {
        summary.notFoundInDbRows += 1;
        continue;
      }
      summary.matchedRows += 1;

      if (hActa) {
        const old = toStr(row[hActa]);
        const newV = inst.acta;
        const highlight = !!old && normValue(old) !== normValue(newV);
        applyChange(row1, hActa, newV, highlight);
      }
      if (hMetraje) {
        const old = toStr(row[hMetraje]);
        const newV = inst.metrajeInstalado;
        const highlight = !!old && normValue(old) !== normValue(newV);
        applyChange(row1, hMetraje, newV, highlight);
      }
      if (hPartida) applyChange(row1, hPartida, inst.nombrePartida || "Ultima Milla", false, false);

      if (hOnt) applyChange(row1, hOnt, inst.snONT, true);
      if (hMesh1) applyChange(row1, hMesh1, inst.snMESH[0] || "", true);
      if (hMesh2) applyChange(row1, hMesh2, inst.snMESH[1] || "", true);
      if (hMesh3) applyChange(row1, hMesh3, inst.snMESH[2] || "", true);
      if (hMesh4) applyChange(row1, hMesh4, inst.snMESH[3] || "", true);
      if (hBox1) applyChange(row1, hBox1, inst.snBOX[0] || "", true);
      if (hBox2) applyChange(row1, hBox2, inst.snBOX[1] || "", true);
      if (hBox3) applyChange(row1, hBox3, inst.snBOX[2] || "", true);
      if (hPhone) applyChange(row1, hPhone, inst.snFONO || "", true);

      if (hTipoOrden) applyChange(row1, hTipoOrden, inst.tipoOrden || "", true);

      if (hCableado) {
        const current = toStr(row[hCableado]);
        const fromDb = toStr(inst.cableadoMesh || inst.servicioCableadoMesh);
        if (normValue(fromDb) === "SERVICIO CABLEADO DE MESH") {
          applyChange(row1, hCableado, "SERVICIO CABLEADO DE MESH", true);
        } else if (fromDb && normValue(current) !== normValue(fromDb)) {
          applyChange(row1, hCableado, fromDb, true);
        }
      }
    }

    for (const row1 of rowShouldOrange) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        applyCellFill(ws, row1, c, FILL_ORANGE);
      }
    }
    for (const [row1, cols] of changesByRow.entries()) {
      cols.forEach((c) => applyCellFill(ws, row1, c, FILL_YELLOW));
    }
    summary.modifiedRows = rowShouldOrange.size;

    const missing = monthInst.filter((x) => x.codigoCliente && !excelCodeSet.has(x.codigoCliente));
    summary.missingClientes = missing.length;

    const missingHeaders = [...headers, "Observacion de la contrata", "Cableado UTP (MTS)"];
    const missingRows = missing.map((inst) => {
      const base = buildOriginalFormatRow(inst, headers);
      const obs = obsContrataFromInst(inst);
      return {
        ...base,
        "Observacion de la contrata": obs.obs,
        "Cableado UTP (MTS)": obs.cableadoUtpMts,
      };
    });

    const cat5e = monthInst.filter((x) => normValue(x.servicioCableadoMesh || x.cableadoMesh) === "SERVICIO CABLEADO DE MESH");
    const cat6 = monthInst.filter((x) => {
      const p = normValue(x.planGamer);
      return p === "GAMER" || p.includes("GAMER");
    });
    summary.cat5eRows = cat5e.length;
    summary.cat6Rows = cat6.length;

    const resumenBase = monthInst;
    summary.cantidadInstalaciones = resumenBase.length;
    summary.totalResidenciales = resumenBase.filter((x) => normValue(x.tipoOrden) === "RESIDENCIAL").length;
    summary.totalCondominio = resumenBase.filter((x) => normValue(x.tipoOrden) === "CONDOMINIO").length;
    summary.totalOntInstalados = resumenBase.filter((x) => !!toStr(x.snONT)).length;
    summary.totalMeshInstalados = resumenBase.reduce((acc, x) => acc + (x.snMESH || []).filter(Boolean).length, 0);
    summary.totalFonoInstalados = resumenBase.filter((x) => !!toStr(x.snFONO)).length;
    summary.totalBoxInstalados = resumenBase.reduce((acc, x) => acc + (x.snBOX || []).filter(Boolean).length, 0);
    summary.cat5ePunto1 = resumenBase.filter(
      (x) => normValue(x.servicioCableadoMesh || x.cableadoMesh) === "SERVICIO CABLEADO DE MESH" && toNum(x.cat5e) === 1
    ).length;
    summary.cat5ePunto2 = resumenBase.filter(
      (x) => normValue(x.servicioCableadoMesh || x.cableadoMesh) === "SERVICIO CABLEADO DE MESH" && toNum(x.cat5e) === 2
    ).length;
    summary.cat5ePunto3 = resumenBase.filter(
      (x) => normValue(x.servicioCableadoMesh || x.cableadoMesh) === "SERVICIO CABLEADO DE MESH" && toNum(x.cat5e) === 3
    ).length;
    summary.cat5ePunto4 = resumenBase.filter(
      (x) => normValue(x.servicioCableadoMesh || x.cableadoMesh) === "SERVICIO CABLEADO DE MESH" && toNum(x.cat5e) === 4
    ).length;
    summary.totalCat5ePuntos =
      summary.cat5ePunto1 +
      summary.cat5ePunto2 * 2 +
      summary.cat5ePunto3 * 3 +
      summary.cat5ePunto4 * 4;
    summary.totalCat6PlanGamer = resumenBase.filter((x) => {
      const p = normValue(x.planGamer);
      return p === "GAMER" || p.includes("GAMER");
    }).length;

    const wsMissing = XLSX.utils.json_to_sheet(missingRows, { header: missingHeaders });
    const wsCat5 = XLSX.utils.json_to_sheet(cat5e.map((x, i) => buildSystemExportRow(x, i)));
    const wsCat6 = XLSX.utils.json_to_sheet(cat6.map((x, i) => buildSystemExportRow(x, i)));

    replaceOrAppendSheet(wb, SHEET_MISSING, wsMissing);
    replaceOrAppendSheet(wb, SHEET_CAT5, wsCat5);
    replaceOrAppendSheet(wb, SHEET_CAT6, wsCat6);

    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const safeName = toStr(file.name).replace(/\.xlsx$/i, "") || "VALIDACION_WIN";
    const finalName = `${safeName}_VALIDACION_WIN.xlsx`;

    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${finalName}"`,
        "X-Validation-Summary": encodeURIComponent(JSON.stringify(summary)),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
