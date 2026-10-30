# IRTRA Calidad IA

Para la presentación en esta computadora, use [INICIAR_PRESENTACION.ps1](INICIAR_PRESENTACION.ps1) y consulte la [validación local del 29/10/2026](auditoria/VALIDACION_LOCAL_2026-10-29.md). Incluye Cypress, comprobación nativa de Excel, evidencias y las condiciones pendientes para producción. El entorno de demostración utiliza datos sintéticos separados.

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

- Base: PostgreSQL 17 en Docker, publicada únicamente en `127.0.0.1:5434` y persistida en el volumen `irtra_postgres_data`.
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

## Aportes tecnológicos de Seminario

Esta entrega incorpora **dos aportes nuevos** al Proyecto de Graduación, integrados y demostrables.

- **Versión entregada:** etiqueta [`seminario-v1`](https://github.com/javier2002guerra-lab/Seminario-IRTRA/releases/tag/seminario-v1) en la rama `main`.
- **Autor:** Javier Guerra (equipo de una persona).
- **Integración continua:** [.github/workflows/ci.yml](.github/workflows/ci.yml) ejecuta las pruebas unitarias e integración (incluidas las de ambos aportes) contra PostgreSQL efímero en cada push.
- **Variables de entorno de ejemplo, sin secretos:** [.env.example](.env.example).

### Aporte 1 — Caché (cache-aside con expiración e invalidación)

- **Qué resuelve.** El tablero ejecutivo ejecuta 13 agregaciones pesadas en PostgreSQL por cada carga, y es el camino de lectura más consultado (inicio, alertas, reportes, ATLAS y el programador de informes). Se añadió una capa de caché con patrón *cache-aside*, expiración (TTL) e **invalidación por versión de namespace** para garantizar coherencia inmediata tras cada escritura.
- **Resultado medido.** ~13x más rápido en promedio (ver `npm run cache:benchmark`).
- **Módulos.**
  - [lib/cache.js](lib/cache.js) — clase `Cache` (cache-aside, métricas), `MemoryStore` (LRU + TTL), singleton anclado a `globalThis` e `invalidateExecutive()`.
  - [lib/cache-redis.js](lib/cache-redis.js) — backend distribuido opcional (Redis) con la misma interfaz (`ioredis`, dependencia opcional).
  - [lib/executive.js](lib/executive.js) — `executiveData` envuelto con `cache.wrap(...)`.
  - [lib/live.js](lib/live.js) — `notifySurveyChange` invalida la caché en cada escritura.
  - [app/api/cache/stats/route.js](app/api/cache/stats/route.js) — métricas (solo admin).
- **Condición de error/límite.** Si el almacén falla, `wrap` cae al productor (nunca rompe la petición); desalojo LRU acotado; `CACHE_ENABLED=false` lo desactiva.

### Aporte 2 — Tiempo real (Server-Sent Events)

- **Qué resuelve.** Antes había que recargar para ver encuestas recién escaneadas o confirmadas. Ahora el servidor **empuja** notificaciones por SSE y las vistas abiertas se actualizan solas, con un aviso y un indicador de conexión en vivo.
- **Módulos.**
  - [lib/events.js](lib/events.js) — bus de publicación/suscripción en proceso (singleton en `globalThis`), ids monótonos y cupo de clientes.
  - [app/api/stream/route.js](app/api/stream/route.js) — endpoint SSE (heartbeat, limpieza al desconectar, autenticación y tope de conexiones).
  - [components/LiveUpdates.js](components/LiveUpdates.js) — cliente `EventSource` que muestra el aviso y refresca la vista.
  - Publicación en [lib/ingest.js](lib/ingest.js) y las rutas de escritura (`validation`, `reanalyze`, `recovery`, `surveys/[id]`, `actions`).
- **Sinergia entre aportes.** Cada escritura invalida la caché **y** publica el evento; al refrescar, la vista vuelve a consultar y la caché (ya invalidada) entrega el dato correcto al instante.
- **Condición de error/límite.** `EventSource` reconecta solo (`retry`); heartbeat cada 15 s; tope `SSE_MAX_CLIENTS` (responde 503); limpieza de la suscripción al abortar la conexión.

### Cómo verificar los aportes

```powershell
# Pruebas unitarias e integración (incluye cache.test, events.test, executive-cache.test)
npm run qa:setup            # una sola vez: base de pruebas local aislada
npm run qa:test

# Rendimiento de la caché (genera auditoria/evidencias/CACHE_BENCHMARK.json)
node --env-file=.env.qa.local scripts/cache-benchmark.mjs

# E2E de ambos aportes sobre la app en ejecución (caché + SSE en vivo)
npm run qa:build
npm run qa:serve            # en otra terminal; sirve https://localhost:3444
npm run qa:playwright       # ejecuta e2e/aportes.spec.mjs entre otros
```

Documentación de diseño: [informe técnico](docs/INFORME_TECNICO_APORTES.pdf) y diagramas editables en [docs/diagramas/](docs/diagramas/) (arquitectura, modelo de datos y secuencia del flujo crítico).

### Configuración (ver `.env.example`)

`CACHE_ENABLED`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`, `CACHE_BACKEND` (`memory`|`redis`), `REDIS_URL`, `SSE_MAX_CLIENTS`.
