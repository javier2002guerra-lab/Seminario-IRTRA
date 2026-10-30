# Registro resumido de evidencias ejecutadas

Fecha actualizada: 13 de octubre de 2026. Todos los objetivos fueron locales.

## Compilación

Comando: `npm run build`  
Resultado: exit code 0; compilación Next.js 16.3 exitosa; 14 páginas estáticas procesadas y rutas dinámicas enumeradas; `postbuild` eliminó `.next/cache` y `.next/dev`.

Escaneo posterior: 706 archivos regulares de `.next`; 0 coincidencias con los valores de `SESSION_SECRET`, `CSRF_SECRET`, contraseña inicial, contraseña PostgreSQL, clave MFA o API key local. Dos junctions de dependencias se omitieron. Los valores no se registraron.

## Automatización

Comando: `npm test`

```text
tests 57
pass 57
fail 0
skipped 0
duration_ms 30531.29
```

La suite incluye tres regresiones del cliente HTTP del login: JSON válido, cuerpo vacío y respuesta HTML de error. Las tres aprobaron sin filtrar el cuerpo interno.

También incluye la regresión de claves React estables para las listas dinámicas de filtros de encuestas y campos SLA.

Comando: `npm run test:e2e`

```text
tests 12
pass 12
fail 0
duration 33.8s
```

## Validación Excel

- Se generó un XLSM desde tres encuestas sintéticas con valores conocidos y se reabrió con `openpyxl`.
- Se contrastaron 58 celdas de preguntas directas, nivel de calidad, clasificación, departamentos, restaurantes, hoteles, Club Corozos y comentarios negativos.
- Se comprobó que restaurante, hotel y lugar de origen no se sustituyen entre sí.
- Se verificaron variantes de nombres de servicios, fechas `dd/mm/aaaa`, `dd-mm-aa` y fallback controlado a fecha de carga.
- El ZIP XLSM fue válido, `vbaProject.bin` conservó exactamente su hash, las cuatro acciones de botones permanecieron y se habilitó recálculo automático.
- La prueba PostgreSQL incluyó una encuesta confirmada y una pendiente: solo la confirmada llegó al payload.
- El XLSX estadístico se reabrió y conservó cantidades, fecha tipada, porcentaje y texto neutralizado contra inyección de fórmulas.
- La descarga `/api/export` autenticada fue aprobada por Playwright sobre el build final.

## Cola de 100 encuestas

Comando: `npm run test:queue`

- Resultado: **APROBADA**; 100/100 encuestas sintéticas procesadas con concurrencia 8 y 0 errores.
- Throughput local: 208.55 encuestas/s; p95 extremo a extremo: 50.57 ms; p99: 60.66 ms.
- Integridad: 10,310 comparaciones de campo, 100 % coincidentes; 1,400 calificaciones persistidas; 0 duplicados.
- Recursos del proceso: 47.07 MB RSS inicial y 64.20 MB de pico; 141 ms CPU de usuario y 78 ms de sistema.
- Limpieza: 100 filas retiradas y 0 filas sintéticas residuales.
- Alcance: analizador determinista local con datos ficticios; no se usó OpenAI y el resultado no representa precisión OCR/IA con escaneos reales.
- Evidencia: `auditoria/evidencias/COLA_100_RESULTADO.json`.

## Puerta de producción

Comando: `npm run security:readiness`  
Resultado esperado en el entorno local: `ready: false`. La puerta bloqueó correctamente por clave MFA institucional ausente, rol PostgreSQL local con privilegios administrativos, ClamAV real no provisionado, una cuenta activa aún sin enrolamiento MFA y ausencia de un segundo administrador con MFA. Las asignaciones de área, constraints validados y triggers de auditoría inmutable sí aprobaron.

Este resultado no es una regresión: demuestra que el sistema no permite declarar producción mientras falten controles externos obligatorios.

## Seguridad dinámica

- `/login`: HTTP 200.
- `/api/health`: HTTP 200.
- `/api/export` sin sesión: HTTP 401.
- login con `Origin` no permitido: HTTP 403.
- contraseña correcta sin MFA: no se emite sesión completa.
- enrolamiento y verificación TOTP: aprobados en navegador.
- reutilización del mismo contador TOTP: rechazada en prueba unitaria.
- ClamAV simulado: `OK` permitido y `FOUND` bloqueado.
- aislamiento por áreas: usuario de área A no pudo consultar encuesta de área B.
- TLS 1.2: conexión exitosa.
- TLS 1.1: conexión rechazada por la pila TLS local.
- Cabeceras observadas: HSTS, CSP con nonce y `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, `DENY`, políticas de permisos, COOP/CORP y `no-store`.
- Certificado: autofirmado de desarrollo, no válido como evidencia de TLS público.

## Dependencias

- `npm audit --json`: 0 vulnerabilidades conocidas; 79 dependencias auditadas.
- `pip-audit` sobre `openpyxl==3.1.5` y `et-xmlfile==2.0.0`: 0 vulnerabilidades conocidas.
- La herramienta temporal de auditoría Python fue retirada después de su uso.

## PostgreSQL

Resumen final leído por `auditoria/resumen-base-datos.mjs`:

```json
{
  "tables": 21,
  "surveys": 6,
  "users": 1,
  "auditRows": 693,
  "duplicateSurveyHashes": 0,
  "duplicateEmailsIgnoringCase": 0,
  "orphanSurveyAreas": 0,
  "databaseSize": "10006 kB"
}
```

La cantidad de auditoría incluye actividad repetida de las pruebas. No contiene contraseñas en este registro.

Respaldo/restauración: un dump custom local se restauró a una base temporal; se verificaron 21 tablas, 6 encuestas, 1 usuario y 0 relaciones encuesta-área huérfanas. La base y el archivo temporal fueron eliminados tras la prueba.

Concurrencia: 100 incrementos simultáneos del contador produjeron 100 hits, sin pérdida.

## Interfaz

El script `auditoria/capturar-evidencias.mjs` produjo cinco capturas reales. Resultado responsive final:

```text
Móvil 390x844: overflow horizontal 0 px
Tableta 768x1024: overflow horizontal 0 px
Capturas generadas: 5
```

La identidad visible se enmascaró antes de capturar. Axe reportó 0 violaciones críticas o serias en login y tablero.

## Limitaciones registradas

No se ejecutaron OpenAI, SMTP, Teams, WhatsApp, escáner físico, ClamAV real, infraestructura pública, WAF, SIEM, HA o backup productivo. FastAPI quedó intencionalmente bloqueado; su revisión fue estática.
