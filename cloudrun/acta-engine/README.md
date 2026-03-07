# Acta Engine (Cloud Run)

Servicio HTTP para extraer el numero de acta desde PDF (barcode) y devolver JSON.

## Endpoints

- `GET /health`
- `POST /extract`

Body esperado:

```json
{
  "fileName": "archivo.pdf",
  "mimeType": "application/pdf",
  "pdfBase64": "<base64>"
}
```

Respuesta:

```json
{
  "ok": true,
  "acta": "005-0058547",
  "detail": "DETECTED"
}
```

## Deploy

```powershell
gcloud auth login
gcloud config set project redes-5bb81
gcloud run deploy acta-det-engine `
  --source cloudrun/acta-engine `
  --region us-central1 `
  --allow-unauthenticated `
  --set-env-vars ENGINE_TOKEN=CAMBIA_ESTE_TOKEN
```

Despues del deploy toma la URL base que devuelve Cloud Run y agrega `/extract`.

Ejemplo:

`https://acta-det-engine-xxxxx-uc.a.run.app/extract`

## Configuracion en apps/web/.env.production.local

```env
ACTA_ENGINE_MODE=active
ACTA_ENGINE_URL=https://acta-det-engine-xxxxx-uc.a.run.app/extract
ACTA_ENGINE_BEARER=CAMBIA_ESTE_TOKEN
ACTA_ENGINE_TIMEOUT_MS=7000
```

## Redeploy de Firebase Hosting

```powershell
firebase deploy --only hosting --project redes-5bb81
```
