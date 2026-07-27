# IRTRA Calidad IA

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FAugustoReyes21%2FIRTRA)

El Blueprint de Render crea el servicio, una base de datos privada, un disco persistente, secretos aleatorios y configura `irtraencuestas.org`. Durante la instalación, Render solicitará únicamente la contraseña inicial del Administrador y la clave del servicio de análisis.

Producto local Next.js para recepción segura, análisis inteligente, priorización y seguimiento de encuestas IRTRA.

## Instalación en esta computadora

```powershell
npm install
Copy-Item .env.example .env.local
docker compose up -d
npm run certs
npm run db:migrate
npm run build
npm start
```

Abra `https://localhost:3443`. El certificado incluido es local/autofirmado, por lo que el navegador solicitará confirmación. Antes del primer arranque cambie `SUPERUSER_PASSWORD`, `SESSION_SECRET` y `CSRF_SECRET`. El usuario predeterminado es `admin@irtra.local`.

Para habilitar análisis real configure `OPENAI_API_KEY`; sin ella el sistema recibe documentos en modo demostración y obliga a revisión humana. Los archivos enviados a OpenAI se limitan al documento requerido, la solicitud usa `store: false` y no registra el contenido personal en logs.

## Operación y respaldo

- Base: PostgreSQL 17 en Docker, publicada únicamente en `127.0.0.1:5433` y persistida en el volumen `irtra_postgres_data`.
- Originales: `private_uploads/`, fuera del directorio público.
- Certificados: `certs/`; reemplace los autofirmados por certificados institucionales en producción.
- Informe gerencial: llena la plantilla institucional `.xlsm` conservando hojas, gráficos y macros. Requiere Python 3.11+ y `openpyxl` (`python -m pip install openpyxl`).
- Respalde PostgreSQL con `docker exec irtra-postgres pg_dump -U irtra irtra_calidad > respaldo.sql` y coordínelo con los originales privados.

## Verificación

```powershell
npm test
npm run build
npm run test:e2e
```

Consulte [diagnóstico](docs/DIAGNOSTICO.md), [manual por rol](docs/MANUAL.md) y [matriz de aceptación](docs/ACEPTACION.md).
