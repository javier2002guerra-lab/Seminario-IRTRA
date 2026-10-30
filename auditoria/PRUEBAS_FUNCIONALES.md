# Pruebas funcionales

## Resultado general

- Suite Node/integración: **57 aprobadas, 0 fallidas, 0 omitidas**; 30.53 s.
- Suite Playwright final: **12 aprobadas, 0 fallidas**; 33.8 s.
- Build de producción: **aprobado**.
- Navegador: Chromium incluido con Playwright.

## Matriz ejecutada

| Módulo/caso | Tipo | Resultado | Evidencia o alcance |
|---|---|---|---|
| Protección de páginas sin sesión | E2E | Aprobado | Redirección a login |
| Login correcto y navegación | E2E | Aprobado | Superusuario ficticio/local |
| Login incorrecto | E2E | Aprobado | Rechazo sin enumeración visible |
| Respuesta vacía/no JSON en login | Unitaria/integración | Aprobado | Mensaje controlado; sin `Unexpected end of JSON input` |
| Claves React en listas dinámicas | Estática/regresión | Aprobado | Filtros de encuestas y campos SLA con claves estables |
| Logout y revocación | E2E/integración | Aprobado | `session_version` aumentó |
| Enrolamiento MFA TOTP | E2E | Aprobado | Contraseña → secreto → TOTP → sesión |
| Cifrado y antirreutilización MFA | Unitaria | Aprobado | AES-256-GCM y contador monotónico |
| Códigos de recuperación | Unitaria | Aprobado | 10 únicos, persistidos como hash |
| API sin sesión | E2E | Aprobado | HTTP 401 |
| Origen cruzado | E2E | Aprobado | HTTP 403 |
| JSON malformado | E2E | Aprobado | Rechazo controlado en caso probado |
| Carga/ingesta PNG | Integración | Aprobado | Archivo aleatorio válido; persistencia y limpieza posterior |
| Extensión/MIME/firma falsos | Unitaria | Aprobado | Rechazados |
| Imagen ilegible | Unitaria | Aprobado | Rechazada por decodificación |
| PDF corrupto o con acciones activas | Unitaria | Aprobado | Rechazado |
| Edición de extracción | E2E | Aprobado | Restaurante, hotel y origen persistieron |
| Confirmar y reabrir encuesta | E2E | Aprobado | Estado y bitácora verificados |
| Solicitar/aprobar eliminación | E2E | Aprobado | Registro eliminado y auditado |
| Listados de encuestas/auditoría | E2E | Aprobado | Sin errores PostgreSQL |
| Boleta digital | E2E | Aprobado | Formato visible |
| Reporte gerencial XLSM | E2E/integración | Aprobado | Descarga autenticada y paquete reabierto correctamente |
| Correspondencia encuesta → XLSM | Integración | Aprobado | 58 celdas contrastadas con fixture conocido; meses, respuestas, sedes, servicios y comentarios |
| Integridad XLSM | Integración | Aprobado | ZIP válido, macros y botones conservados, `calcChain` obsoleto retirado y recálculo automático |
| Reporte estadístico XLSX | Integración | Aprobado | Hojas, fechas, porcentajes, cantidades y neutralización de fórmulas verificadas |
| Exportar solo confirmadas | PostgreSQL/integración | Aprobado | Confirmada incluida y pendiente excluida dentro de transacción revertida |
| Dependencias Excel offline | Integración | Aprobado | Versiones exactas de `openpyxl` y `et-xmlfile` verificadas contra lockfile |
| Planes de acción | E2E | Aprobado | Pantalla y actualización abiertas |
| Impacto financiero | E2E | Aprobado | Ruta administrativa funcional |
| Integraciones | E2E | Aprobado | Pantalla/configuración local; no envíos externos |
| Health check | E2E/dinámica | Aprobado | HTTP 200 y conexión DB |
| Bitácora inmutable | Integración | Aprobado | UPDATE/DELETE bloqueados |
| Transacción commit/rollback | Integración | Aprobado | Atomicidad básica comprobada |
| Concurrencia de límite | Integración | Aprobado | 100 incrementos, 100 registrados |
| Cola de análisis | Integración/carga sintética | Aprobado | 100/100, concurrencia 8, 10,310 campos exactos y 0 duplicados |
| Acceso administrativo de verificador | Unitaria/E2E | Aprobado | Rutas admin rechazan; el formulario de área se oculta |
| Alcance de encuestas por área | Integración adversarial | Aprobado | Dos áreas/usuario: permite A, deniega B |
| ClamAV | Integración simulada | Aprobado | Permite `OK`, bloquea `FOUND`; servicio real pendiente |
| Recuperación del huésped | Código/E2E parcial | Parcial | Vista y retención revisadas; no se contactó a personas |
| Programación de reportes | Código/E2E parcial | Parcial | CRUD local; scheduler/canales reales no probados |
| Escáner físico | No ejecutada | Bloqueada | Sin hardware autorizado |
| OpenAI real | No ejecutada | Bloqueada | Sin credencial/aprobación para enviar documentos |
| SMTP/Teams/WhatsApp | No ejecutada | Bloqueada | Sin credenciales y sin autorización de envío |
| Recuperación/cambio de contraseña | Integración/E2E | Aprobado | Cambio obligatorio, temporal y revocación global |
| FastAPI heredado | Inspección estática | Bloqueado | No puede iniciar en producción; opt-in solo de desarrollo |

## Pruebas de interfaz

Se verificaron login, tablero y carga a 1440 px, además del tablero a 390×844 y 768×1024. El cálculo automatizado final reportó cero píxeles de desbordamiento horizontal. Axe no encontró violaciones críticas o serias en login y tablero.

Las capturas reales, con el usuario enmascarado, son:

- [`01-login.png`](evidencias/capturas/01-login.png)
- [`02-dashboard.png`](evidencias/capturas/02-dashboard.png)
- [`03-carga.png`](evidencias/capturas/03-carga.png)
- [`04-dashboard-movil.png`](evidencias/capturas/04-dashboard-movil.png)
- [`05-dashboard-tableta.png`](evidencias/capturas/05-dashboard-tableta.png)

## Base de datos

El estado final local contiene 21 tablas, 6 encuestas y 1 usuario. Se observaron 0 hashes de encuesta duplicados, 0 correos duplicados ignorando mayúsculas y 0 relaciones encuesta-área huérfanas. El tamaño fue 10006 kB; la bitácora alcanzó 693 entradas por las pruebas repetidas.

Se generó un backup en formato custom, se restauró en `irtra_audit_restore_20261012`, se comprobaron 21 tablas, 6 encuestas, 1 usuario y 0 huérfanos, y luego se eliminó tanto la base temporal como el archivo temporal. No se borró información funcional existente.

## Cobertura que falta antes de aceptar

- Matriz completa de autorización con usuarios reales de distintas áreas y todos los endpoints.
- Casos negativos sistemáticos para cada cuerpo JSON, fecha, ID, importe y transición de estado.
- Navegadores Firefox, WebKit y dispositivos físicos.
- Fallos de red/DB durante operaciones largas y reintentos idempotentes.
- Upgrade/rollback entre versiones reales de esquema.
- Integraciones externas en un sandbox institucional.
- Pruebas de restauración desde el mecanismo productivo, no solo Docker local.
