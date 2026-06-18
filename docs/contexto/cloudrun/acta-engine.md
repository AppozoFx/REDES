# Cloud Run acta-engine - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Esta unidad documenta el servicio Cloud Run que extrae codigos de acta desde PDFs y su consumo desde el flujo web de renombrado/clasificacion de actas.

## Alcance Leido

- `cloudrun/acta-engine/README.md`
- `cloudrun/acta-engine/main.py`
- `cloudrun/acta-engine/Dockerfile`
- `cloudrun/acta-engine/requirements.txt`
- `apps/web/src/app/api/instalaciones/actas-dia/renombrar/route.ts`
- `apps/web/src/app/api/actas/validate/route.ts`

No se ejecutaron deploys, Cloud Run, emuladores, pruebas contra Storage ni llamadas reales al servicio.

## Proposito

`acta-engine` es un microservicio Flask desplegable en Cloud Run para detectar el numero de acta desde un PDF. Su salida se integra al proceso web de actas como un motor deterministico externo, antes de los pasos de IA, para mejorar deteccion en PDFs donde el texto embebido o los decoders locales no bastan.

## Runtime Y Dependencias

- Runtime base: `python:3.11-slim`.
- Servidor: `gunicorn --bind :8080 --workers 1 --threads 8 --timeout 0 main:app`.
- Dependencias Python:
  - `Flask`
  - `gunicorn`
  - `Pillow`
  - `PyMuPDF`
  - `pyzbar`
- Dependencia nativa instalada por Dockerfile:
  - `libzbar0`

El servicio procesa PDFs con PyMuPDF, renderiza la primera pagina a imagen y usa `pyzbar` para decodificar codigos de barra.

## Endpoints

### `GET /health`

Devuelve estado basico del servicio:

```json
{ "ok": true, "service": "acta-engine" }
```

No requiere bearer token en la implementacion actual.

### `POST /extract`

Contrato esperado:

```json
{
  "fileName": "archivo.pdf",
  "mimeType": "application/pdf",
  "pdfBase64": "<base64>"
}
```

Respuesta exitosa con acta:

```json
{
  "ok": true,
  "acta": "005-0058547",
  "detail": "DETECTED"
}
```

Respuestas funcionales sin match tambien vuelven HTTP 200 con `ok: true`, `acta: null` y `detail` como `PDF_BASE64_REQUIRED`, `PDF_BASE64_INVALID` o `NO_MATCH`. Fallas internas devuelven HTTP 500 con `ok: false`.

## Autenticacion

`ENGINE_TOKEN` es opcional en el codigo:

- Si `ENGINE_TOKEN` tiene valor, `POST /extract` exige header `Authorization: Bearer <token>`.
- Si `ENGINE_TOKEN` esta vacio, `POST /extract` queda sin autenticacion.

El README propone desplegar Cloud Run con `--allow-unauthenticated` y proteger la extraccion con `ENGINE_TOKEN`. Esto hace que el secreto sea critico: una revision operativa debe confirmar que nunca se despliegue produccion con `ENGINE_TOKEN` vacio.

## Algoritmo De Extraccion

1. Decodifica `pdfBase64`.
2. Abre el PDF con PyMuPDF.
3. Renderiza solo la primera pagina con zoom `2.6`.
4. Prueba regiones superiores/derechas de interes.
5. Si no encuentra codigo en esas regiones, intenta la pagina completa.
6. Normaliza el resultado:
   - conserva solo digitos;
   - rechaza menos de 7 digitos;
   - rechaza prefijo `000`;
   - rechaza valores todos cero o sufijo todos cero;
   - devuelve formato `NNN-NNNNN...`.

## Integracion Web

Consumidor principal:

- `apps/web/src/app/api/instalaciones/actas-dia/renombrar/route.ts`

Variables de entorno leidas por la ruta:

- `ACTA_ENGINE_URL`
- `ACTA_ENGINE_BEARER`
- `ACTA_ENGINE_TIMEOUT_MS`
- `ACTA_ENGINE_MODE`

Modos soportados:

- `off`: no llama al motor externo.
- `shadow`: llama al motor, registra resultado en traza, pero no aplica el acta.
- `active`: aplica el acta detectada por el motor.

Detalle importante: si `ACTA_ENGINE_MODE` queda vacio u `off`, pero `ACTA_ENGINE_URL` existe, la ruta web cambia implicitamente a `active`. Esto hace que configurar solo la URL active el motor externo.

Orden observado dentro de `extractActaFromPdf`:

1. Regex sobre texto embebido del PDF.
2. Parser deterministico de streams PDF.
3. Decoder local de barcode con ZXING sobre ROI y variantes.
4. Motor deterministico externo `acta-engine`, si esta habilitado.
5. IA sobre imagen.
6. IA sobre PDF/imagen en reintentos del flujo.

En reanalisis riguroso de archivos en error, la ruta fuerza `forceEngineActive: true`, omite texto embebido y permite que el motor externo participe aunque el modo global este apagado.

## Relacion Con Actas En Firestore

El motor solo detecta el numero de acta. La asociacion con cliente/codigo se resuelve despues en la ruta web:

- `resolveClienteFromActa` consulta colecciones de actas/instalaciones para asociar acta con cliente.
- `resolveActaFromCodigoCliente` busca acta por codigo de cliente.
- El movimiento final entre `guias_actas/actas_servicio/inbox`, `ok` y `error` lo hace la ruta web contra Storage.

La validacion independiente de actas se ve en:

- `apps/web/src/app/api/actas/validate/route.ts`

Esa ruta exige sesion web, acceso habilitado y admin/permiso `ORDENES_LIQUIDAR`/area `INSTALACIONES`, y consulta `actas/{code}` para bloquear actas ya liquidadas.

## Deploy Documentado En README

El README propone:

```powershell
gcloud run deploy acta-det-engine `
  --source cloudrun/acta-engine `
  --region us-central1 `
  --allow-unauthenticated `
  --set-env-vars ENGINE_TOKEN=CAMBIA_ESTE_TOKEN
```

Y luego configurar la app web con:

```env
ACTA_ENGINE_MODE=active
ACTA_ENGINE_URL=https://acta-det-engine-xxxxx-uc.a.run.app/extract
ACTA_ENGINE_BEARER=CAMBIA_ESTE_TOKEN
ACTA_ENGINE_TIMEOUT_MS=7000
```

El README tambien indica redeploy de Firebase Hosting despues de cambiar envs.

## Riesgos Y Observaciones

- `ENGINE_TOKEN` vacio deja `POST /extract` abierto si Cloud Run permite trafico anonimo.
- `ACTA_ENGINE_URL` configurada sin `ACTA_ENGINE_MODE` activa el motor en modo `active` por defecto en la ruta web.
- `gunicorn --timeout 0` desactiva timeout del proceso; conviene validar limites de Cloud Run y abortos cliente.
- No se observa limite propio de tamano de request en Flask; la ruta web limita PDFs a `20 MB`, pero el servicio aislado no lo refuerza.
- El servicio procesa solo la primera pagina del PDF.
- El healthcheck es publico por diseno actual.
- Existe `cloudrun/acta-engine/__pycache__/main.cpython-312.pyc`; parece artefacto generado y deberia excluirse del versionado si no es intencional.
- El deploy sugerido usa `us-central1`; conviene validar latencia/costos frente a la ubicacion de usuarios, Hosting y Storage.

## Pendientes

- Confirmar que produccion tiene `ENGINE_TOKEN` no vacio y que `ACTA_ENGINE_BEARER` coincide.
- Decidir si el modo por defecto con solo `ACTA_ENGINE_URL` debe ser `active` o si conviene exigir `ACTA_ENGINE_MODE=active` explicito.
- Agregar limite de tamano/paginas o validacion temprana en `POST /extract`.
- Revisar `gunicorn --timeout 0` y definir timeout operativo.
- Crear smoke test controlado para `/health` y `/extract` con PDF sintentico/no sensible.
- Decidir si `__pycache__` debe eliminarse e ignorarse.
- Documentar rollback: pasar `ACTA_ENGINE_MODE=off` o retirar `ACTA_ENGINE_URL` y redeploy de web.

