/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function ymdLimaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseArgs(argv) {
  const args = {
    from: "2026-01-01",
    to: ymdLimaToday(),
    execute: false,
    chunk: 350,
    mapJson: "",
    mapFile: "",
    updatedBy: process.env.MIGRACION_UPDATED_BY || "script-remap-coordinadores",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) args.from = String(argv[++i]).trim();
    else if (a === "--to" && argv[i + 1]) args.to = String(argv[++i]).trim();
    else if (a === "--execute") args.execute = true;
    else if (a === "--dry-run") args.execute = false;
    else if (a === "--chunk" && argv[i + 1]) args.chunk = Math.max(1, Math.min(450, Number(argv[++i]) || 350));
    else if (a === "--map-json" && argv[i + 1]) args.mapJson = String(argv[++i]).trim();
    else if (a === "--map-file" && argv[i + 1]) args.mapFile = String(argv[++i]).trim();
    else if (a === "--updated-by" && argv[i + 1]) args.updatedBy = String(argv[++i]).trim();
  }

  return args;
}

function assertYmd(v, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) {
    throw new Error(`Invalid ${field}, expected YYYY-MM-DD`);
  }
}

function readServiceAccountFromEnvOrFile() {
  const envJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.TARGET_FIREBASE_SERVICE_ACCOUNT_JSON ||
    "";

  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  }

  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps", "web", ".env.local"),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    const m = txt.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(\{.*\})$/m);
    if (!m) continue;
    return JSON.parse(m[1]);
  }

  throw new Error("Service account not found in env or .env.local");
}

function normalizeMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const oldUid = String(k || "").trim();
    const newUid = String(v || "").trim();
    if (!oldUid || !newUid) continue;
    if (oldUid === newUid) continue;
    out[oldUid] = newUid;
  }
  return out;
}

function readMapping(args) {
  if (args.mapJson) {
    return normalizeMap(JSON.parse(args.mapJson));
  }
  if (args.mapFile) {
    const full = path.isAbsolute(args.mapFile) ? args.mapFile : path.join(process.cwd(), args.mapFile);
    if (!fs.existsSync(full)) throw new Error(`Map file not found: ${full}`);
    const txt = fs.readFileSync(full, "utf8");
    return normalizeMap(JSON.parse(txt));
  }
  return {};
}

function getOrderCoordinatorUid(data) {
  const o = data?.orden || {};
  return String(o.coordinadorCuadrilla || o.coordinadorUid || "").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertYmd(args.from, "--from");
  assertYmd(args.to, "--to");
  if (args.from > args.to) throw new Error("Invalid range: from > to");

  const sa = readServiceAccountFromEnvOrFile();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: sa.project_id || sa.projectId,
        clientEmail: sa.client_email || sa.clientEmail,
        privateKey: String(sa.private_key || sa.privateKey || "").replace(/\\n/g, "\n"),
      }),
      projectId: sa.project_id || sa.projectId,
    });
  }
  const db = admin.firestore();

  const mapping = readMapping(args);
  const mapKeys = Object.keys(mapping);

  const snap = await db
    .collection("instalaciones")
    .where("fechaOrdenYmd", ">=", args.from)
    .where("fechaOrdenYmd", "<=", args.to)
    .get();

  const summaryByCurrent = new Map();
  const candidates = [];

  for (const d of snap.docs) {
    const data = d.data() || {};
    const current = getOrderCoordinatorUid(data);
    if (!current) continue;
    summaryByCurrent.set(current, (summaryByCurrent.get(current) || 0) + 1);

    if (mapKeys.length && mapping[current]) {
      candidates.push({
        id: d.id,
        current,
        target: mapping[current],
        fechaOrdenYmd: String(data.fechaOrdenYmd || ""),
      });
    }
  }

  const discovered = Array.from(summaryByCurrent.entries())
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count);

  console.log("=== Remap Coordinadores Instalaciones ===");
  console.log(JSON.stringify(
    {
      range: { from: args.from, to: args.to },
      execute: args.execute,
      scanned: snap.size,
      mappingCount: mapKeys.length,
      candidates: candidates.length,
    },
    null,
    2
  ));

  if (!mapKeys.length) {
    console.log("\nNo mapping provided. Top coordinador UID encontrados en orden.coordinadorCuadrilla:");
    console.log(JSON.stringify(discovered.slice(0, 40), null, 2));
    console.log("\nPasa --map-json o --map-file para aplicar remap.");
    return;
  }

  const byPair = new Map();
  for (const c of candidates) {
    const k = `${c.current} -> ${c.target}`;
    byPair.set(k, (byPair.get(k) || 0) + 1);
  }

  console.log("\nPreview por reemplazo:");
  console.log(JSON.stringify(Array.from(byPair.entries()).map(([k, count]) => ({ replace: k, count })), null, 2));
  console.log("\nSample IDs:");
  console.log(JSON.stringify(candidates.slice(0, 30), null, 2));

  if (!args.execute) {
    console.log("\nDry-run: sin cambios. Usa --execute para aplicar.");
    return;
  }

  let written = 0;
  for (let i = 0; i < candidates.length; i += args.chunk) {
    const part = candidates.slice(i, i + args.chunk);
    const batch = db.batch();
    for (const c of part) {
      const ref = db.collection("instalaciones").doc(c.id);
      batch.set(
        ref,
        {
          orden: {
            coordinadorCuadrilla: c.target,
            coordinadorUid: c.target,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: args.updatedBy,
        },
        { merge: true }
      );
    }
    await batch.commit();
    written += part.length;
    console.log(`Applied ${written}/${candidates.length}`);
  }

  console.log("\nRemap completado.");
  console.log(JSON.stringify({ written, range: { from: args.from, to: args.to } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

