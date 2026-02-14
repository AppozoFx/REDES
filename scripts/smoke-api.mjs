import process from "node:process";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const sessionCookie = process.env.SESSION_COOKIE || "";

const endpoints = [
  { name: "materiales:list", method: "GET", path: "/api/materiales/list?area=INSTALACIONES" },
  { name: "cuadrillas:list", method: "GET", path: "/api/cuadrillas/list?area=INSTALACIONES" },
  { name: "cuadrillas:info", method: "GET", path: "/api/cuadrillas/info?id=TEST" },
  { name: "cuadrillas:stock", method: "GET", path: "/api/cuadrillas/stock?id=TEST" },
  { name: "equipos:validate", method: "GET", path: "/api/equipos/validate?sn=TEST" },
  { name: "equipos:list", method: "GET", path: "/api/equipos/list" },
  { name: "equipos:descripciones", method: "GET", path: "/api/equipos/descripciones" },
  { name: "ordenes:garantias:list", method: "GET", path: "/api/ordenes/garantias/list" },
  { name: "ordenes:liquidacion:list", method: "GET", path: "/api/ordenes/liquidacion/list" },
  { name: "inconcert:gerencia:list", method: "GET", path: "/api/inconcert/gerencia/list" },
];

function allowed(status, allow) {
  return allow.includes(status);
}

async function run() {
  const results = [];
  for (const ep of endpoints) {
    const url = baseUrl + ep.path;
    const headers = sessionCookie ? { cookie: sessionCookie } : {};
    const res = await fetch(url, { method: ep.method, headers, cache: "no-store" });

    const unauthAllow = [401, 403];
    const authAllow = [200, 403, 404];
    const ok = sessionCookie ? allowed(res.status, authAllow) : allowed(res.status, unauthAllow);
    results.push({ name: ep.name, status: res.status, ok });
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const flag = r.ok ? "OK" : "FAIL";
    console.log(`${flag} ${r.name} -> ${r.status}`);
  }

  if (failed.length) {
    console.error(`Failures: ${failed.length}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});