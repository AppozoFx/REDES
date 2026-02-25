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

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseArgs(argv) {
  const args = {
    from: "2026-01-01",
    to: ymdLimaToday(),
    mapFile: "",
    updatedBy: "script-remap-coordinadores",
    outDir: path.join(process.cwd(), "scripts", "tmp"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) args.from = String(argv[++i]).trim();
    else if (a === "--to" && argv[i + 1]) args.to = String(argv[++i]).trim();
    else if (a === "--map-file" && argv[i + 1]) args.mapFile = String(argv[++i]).trim();
    else if (a === "--updated-by" && argv[i + 1]) args.updatedBy = String(argv[++i]).trim();
    else if (a === "--out-dir" && argv[i + 1]) args.outDir = String(argv[++i]).trim();
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

function readMapping(mapFile) {
  if (!mapFile) return {};
  const full = path.isAbsolute(mapFile) ? mapFile : path.join(process.cwd(), mapFile);
  if (!fs.existsSync(full)) throw new Error(`Map file not found: ${full}`);
  const raw = JSON.parse(fs.readFileSync(full, "utf8"));
  const out = {};
  for (const [oldUid, newUid] of Object.entries(raw || {})) {
    const oldV = String(oldUid || "").trim();
    const newV = String(newUid || "").trim();
    if (!oldV || !newV || oldV === newV) continue;
    out[oldV] = newV;
  }
  return out;
}

function getOrderCoordinatorUid(data) {
  const orden = data?.orden || {};
  return String(orden.coordinadorCuadrilla || orden.coordinadorUid || "").trim();
}

function topRows(counterMap, limit = 30) {
  return Array.from(counterMap.entries())
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertYmd(args.from, "--from");
  assertYmd(args.to, "--to");
  if (args.from > args.to) throw new Error("Invalid range: from > to");

  const mapping = readMapping(args.mapFile);
  const mapEntries = Object.entries(mapping);

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

  const snap = await db
    .collection("instalaciones")
    .where("fechaOrdenYmd", ">=", args.from)
    .where("fechaOrdenYmd", "<=", args.to)
    .get();

  const byCurrent = new Map();
  let changedByScript = 0;
  let withoutCoordinator = 0;
  const docs = [];

  for (const d of snap.docs) {
    const data = d.data() || {};
    const current = getOrderCoordinatorUid(data);
    const updatedBy = String(data.updatedBy || "").trim();
    if (updatedBy === args.updatedBy) changedByScript += 1;
    if (!current) withoutCoordinator += 1;
    else byCurrent.set(current, (byCurrent.get(current) || 0) + 1);
    docs.push({ id: d.id, current, updatedBy, fechaOrdenYmd: String(data.fechaOrdenYmd || "") });
  }

  const mapStatus = mapEntries.map(([oldUid, newUid]) => {
    const remainingOld = byCurrent.get(oldUid) || 0;
    const nowInTarget = byCurrent.get(newUid) || 0;
    const changedNow = docs.filter((x) => x.current === newUid && x.updatedBy === args.updatedBy).length;
    const samples = docs
      .filter((x) => x.current === newUid && x.updatedBy === args.updatedBy)
      .slice(0, 5)
      .map((x) => x.id);
    return { oldUid, newUid, remainingOld, nowInTarget, changedNow, samples };
  });

  const pendingByMap = mapStatus
    .filter((x) => x.remainingOld > 0)
    .sort((a, b) => b.remainingOld - a.remainingOld);

  const topCurrent = topRows(byCurrent, 40);

  const stamp = nowStamp();
  fs.mkdirSync(args.outDir, { recursive: true });
  const mdPath = path.join(args.outDir, `reporte-remap-coordinadores-${stamp}.md`);
  const csvPath = path.join(args.outDir, `reporte-remap-coordinadores-${stamp}.csv`);
  const scsvPath = path.join(args.outDir, `reporte-remap-coordinadores-${stamp}.scsv.csv`);
  const tsvPath = path.join(args.outDir, `reporte-remap-coordinadores-${stamp}.tsv`);

  const md = [];
  md.push("# Reporte temporal remap coordinadores");
  md.push("");
  md.push(`- Rango: ${args.from} a ${args.to}`);
  md.push(`- Total instalaciones: ${snap.size}`);
  md.push(`- Marcadas con updatedBy=${args.updatedBy}: ${changedByScript}`);
  md.push(`- Sin coordinador en orden: ${withoutCoordinator}`);
  md.push(`- Fecha reporte: ${new Date().toISOString()}`);
  md.push("");

  if (mapEntries.length) {
    md.push("## Estado por mapeo (visual)");
    md.push("");
    md.push("| Old UID | New UID | Cambiados (updatedBy) | Restan old UID | Total actual en New UID |");
    md.push("|---|---:|---:|---:|---:|");
    for (const r of mapStatus.sort((a, b) => b.changedNow - a.changedNow)) {
      md.push(`| ${r.oldUid} | ${r.newUid} | ${r.changedNow} | ${r.remainingOld} | ${r.nowInTarget} |`);
    }
    md.push("");
  }

  if (pendingByMap.length) {
    md.push("## Pendientes del mapa");
    md.push("");
    for (const p of pendingByMap) {
      md.push(`- ${p.oldUid} -> ${p.newUid}: restan ${p.remainingOld}`);
    }
    md.push("");
  }

  md.push("## Top coordinadores actuales");
  md.push("");
  md.push("| UID | Cantidad |");
  md.push("|---|---:|");
  for (const r of topCurrent) {
    md.push(`| ${r.uid} | ${r.count} |`);
  }
  md.push("");

  md.push("## Muestras cambiadas");
  md.push("");
  for (const row of mapStatus) {
    if (!row.samples.length) continue;
    md.push(`- ${row.oldUid} -> ${row.newUid}: ${row.samples.join(", ")}`);
  }
  md.push("");

  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  const csv = [];
  csv.push("old_uid,new_uid,cambiados_updatedBy,restan_old_uid,total_actual_new_uid");
  for (const r of mapStatus.sort((a, b) => b.changedNow - a.changedNow)) {
    csv.push(`${r.oldUid},${r.newUid},${r.changedNow},${r.remainingOld},${r.nowInTarget}`);
  }
  fs.writeFileSync(csvPath, `${csv.join("\n")}\n`, "utf8");
  fs.writeFileSync(scsvPath, `${csv.map((line) => line.replace(/,/g, ";")).join("\n")}\n`, "utf8");
  fs.writeFileSync(tsvPath, `${csv.map((line) => line.replace(/,/g, "\t")).join("\n")}\n`, "utf8");

  console.log("Reporte generado:");
  console.log(mdPath);
  console.log(csvPath);
  console.log(scsvPath);
  console.log(tsvPath);
  console.log(
    JSON.stringify(
      {
        range: { from: args.from, to: args.to },
        total: snap.size,
        changedByScript,
        pendingMapRows: pendingByMap.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
