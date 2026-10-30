# Cambios realizados

Todos los cambios conservan la arquitectura existente y tienen prueba de regresión o validación E2E. No se modificaron credenciales reales ni infraestructura externa.

| Cambio | Archivos principales | Validación |
|---|---|---|
| Revocación real al cerrar sesión | `app/api/auth/logout/route.js` | E2E y versión de sesión |
| IP cliente confiable solo con proxy explícito | `lib/security.js`, `server.mjs` | Prueba unitaria |
| Contraseña inicial obligatoria en producción | `lib/security.js`, `.env.example` | Prueba unitaria y build |
| Formulario de login seguro sin JavaScript | `app/login/page.js` | Prueba estática y E2E |
| CSP compatible con desarrollo, estricta en producción | `proxy.js` | Build, E2E y cabeceras reales |
| Sandbox para originales/PDF | `app/api/surveys/[id]/file/route.js` | Prueba unitaria |
| Corrección de ID de auditoría en eliminación | `app/api/surveys/[id]/deletion/route.js` | E2E de eliminación |
| Retención de recuperación del huésped | `scripts/retention.mjs` | Prueba de regresión sin borrar datos existentes |
| `UPLOAD_DIR` respetado en producción | `lib/files.js` | Prueba unitaria |
| Evitar que Turbopack rastree el workspace como upload | `lib/files.js` | Build y prueba estática |
| Eliminación de cachés sensibles del artefacto | `scripts/clean-build-cache.mjs`, `package.json` | 639 archivos regulares, 0 coincidencias de secretos |
| Control admin reutilizable y verificable | `lib/access.js`, `lib/auth.js` | Prueba de autorización |
| Ocultar acción de área al verificador | `app/areas/page.js` | Revisión/E2E |
| Longitud mínima de contraseña alineada a 14 | `app/usuarios/user-form.js` | Revisión de formulario |
| Carga de `.env.local` en E2E | `package.json` | 12/12 E2E |
| Corrección responsive móvil/tableta y capas modales | hojas CSS en `app/` | 0 px de overflow y capturas |
| Prueba completa de ingesta ficticia | `tests/ingest.test.mjs` | Persistencia y limpieza aprobadas |
| Casos de endurecimiento | `tests/security-hardening.test.mjs`, `tests/files.test.mjs` | Incluidos en suite final 57/57 |
| Claves estables en listas React | `app/encuestas/page.js`, `app/areas/area-form.js`, `tests/react-list-keys.test.mjs` | Advertencias de `key` corregidas y regresión aprobada |
| Evidencia reproducible | `auditoria/capturar-evidencias.mjs`, `auditoria/resumen-base-datos.mjs` | Scripts ejecutados |

## Verificación posterior

1. `npm run build`: aprobado; nuevas rutas MFA/contraseña/seguridad enumeradas por Next y `postbuild` ejecutado.
2. Suite Node: 57/57 aprobadas.
3. Playwright: 12/12 aprobadas.
4. Capturas: 5 generadas; usuario enmascarado.
5. Escaneo del artefacto `.next`: 706 archivos regulares, 0 coincidencias con valores secretos locales; `.next/cache` y `.next/dev` ausentes.
6. `npm audit`: 0 vulnerabilidades conocidas.

## Cambios deliberadamente no aplicados

- Se adoptó la política conservadora solicitada: administrador global y verificador limitado a sus áreas; la institución debe ratificarla.
- FastAPI no se eliminó, pero no puede iniciar en producción y exige una bandera explícita de desarrollo aislado.
- No se cambió proveedor/plataforma, base productiva o secretos.
- No se activó envío real a OpenAI, correo, Teams o WhatsApp.
- No se ejecutó retención destructiva sobre datos existentes.

## Segunda fase de seguridad — 13 de octubre

- `lib/mfa.js` y rutas `/api/auth/mfa/*`: TOTP, cifrado, recuperación y antirreplay.
- Login convertido en desafío de dos fases; la cookie de sesión completa nace solo después del MFA.
- `/seguridad` y `/api/auth/password`: cambio de contraseña con revocación global.
- Administración de usuarios: activar, desactivar, contraseña temporal y reinicio MFA, todo auditado.
- `lib/scope.js`: autorización por área aplicada a lecturas y mutaciones; planes, reportes y exportaciones incluidos.
- `lib/malware-scan.js`: protocolo ClamAV INSTREAM y health gate productivo.
- `lib/analyzer.js`: procesamiento externo fail-closed por privacidad.
- `app/main.py`: aplicación heredada bloqueada.
- `lib/db.js`: campos MFA, `created_by`, constraints validados y verificación de rol/TLS.
- `scripts/production-readiness.mjs`: puerta automatizada de producción.
- `render.yaml`: recursos pagados, checks previos, pool, disco y TLS requerido.

## Corrección de exportación Excel — 13 de octubre

- `lib/managerial-export.js` centraliza la lectura PostgreSQL, ordena áreas y conserva datos generales, respuestas, comentarios y calificaciones.
- `scripts/fill-managerial-template.py` separa correctamente restaurante, hotel y lugar de origen; normaliza variantes de servicios y fechas; llena hojas de restaurante, hotel, Club Corozos y comentarios negativos.
- El XLSM conserva sin cambios el proyecto VBA y las acciones de sus botones. Se elimina `calcChain` al reemplazar fórmulas históricas y se fuerza recálculo automático.
- `tests/excel-export.test.mjs` y `tests/verify-excel-output.py` generan y reabren XLSM/XLSX, contrastan 58 celdas y prueban el filtro de confirmación contra PostgreSQL.
- El instalador Python ya no depende de red en cada build: valida primero las versiones exactas presentes contra `excel-deps.lock`.

## Cola y simulación de 100 encuestas — 13 de octubre

- `lib/bounded-queue.js` incorpora procesamiento con concurrencia limitada y orden estable.
- `lib/scanner-watch.js` evita sondeos superpuestos y usa `SCAN_CONCURRENCY` con valor seguro por defecto 1 y máximo 8.
- `scripts/simulate-survey-queue.mjs` ejecuta 100 análisis sintéticos con verdad conocida, transacciones PostgreSQL, 1,400 calificaciones, comparación campo a campo y limpieza posterior.
- `tests/bounded-queue.test.mjs` verifica 100 trabajos, límite de concurrencia y ausencia de mezcla de resultados.
- `npm run test:queue` aprobó 100/100 encuestas, 10,310 comparaciones exactas, 0 errores, 0 duplicados y 0 filas residuales.

## Respuesta segura del login — 13 de octubre

- `app/login/page.js` ya no presupone que toda respuesta HTTP contiene JSON; maneja cuerpos vacíos, HTML de error y fallos de red sin producir un `SyntaxError` en el navegador.
- `app/api/auth/login/route.js` convierte fallos internos —incluida indisponibilidad de PostgreSQL— en una respuesta JSON controlada con HTTP 503.
- `tests/http-client.test.mjs` cubre JSON válido, respuesta vacía y HTML de error sin exponer contenido interno.
- Se reprodujo la causa operativa local: PostgreSQL estaba detenido. Después de iniciarlo, `/api/auth/login` respondió HTTP 200 y solicitó MFA correctamente.

## Listas React sin advertencias — 13 de octubre

- Los filtros de encuestas asignan claves estables y valores explícitos a opciones de área, prioridad, clasificación, servicio y estado.
- Los campos dinámicos del SLA por prioridad usan el nombre del campo como clave estable.
- Se revisaron las demás listas JSX del proyecto y se añadió `tests/react-list-keys.test.mjs` como regresión.
