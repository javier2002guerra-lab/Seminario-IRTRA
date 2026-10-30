# Auditoría general del sistema IRTRA

**Fecha de cierre actualizada:** 13 de octubre de 2026  
**Entorno evaluado:** estación local Windows, Node.js, Chromium y PostgreSQL 17 en Docker  
**Dictamen resumido:** **NO APTO PARA PRODUCCIÓN**

## Alcance y metodología

Se inspeccionó el repositorio completo, se compiló el artefacto de producción, se ejecutaron pruebas unitarias, de integración, navegador, accesibilidad, seguridad dinámica, concurrencia, respaldo/restauración y carga local. También se revisaron dependencias, configuración, consultas SQL, esquema, autenticación, autorización, tratamiento de archivos, integración con IA y documentación operativa.

La revisión tomó como guía OWASP Top 10 y controles aplicables de OWASP ASVS. No se atacó ningún servidor público ni se enviaron datos a servicios externos. Las pruebas utilizaron datos locales o ficticios. Una prueba no ejecutada no se considera aprobada.

## Arquitectura encontrada

La aplicación activa es un monolito web:

- **Frontend y backend:** Next.js 16.3, React 19 y Node.js 22 o superior.
- **API:** 24 archivos de rutas bajo `app/api`, con autenticación por cookie JWT firmada mediante `jose`.
- **Base de datos:** PostgreSQL 17 mediante `pg`; 21 tablas, transacciones y bitácora inmutable por triggers.
- **Procesamiento documental:** `sharp` para imágenes, validación propia de PDF y OpenAI Responses API para extracción/clasificación.
- **Reportes:** generación XLSM/XLSX mediante scripts Python y `openpyxl`.
- **Correo e integraciones:** Nodemailer, webhooks de Teams y API de WhatsApp, todos opcionales.
- **Servidor:** HTTPS propio en `server.mjs` o terminación TLS externa.
- **Despliegue declarado:** Render mediante `render.yaml`.

Existe además una segunda aplicación heredada FastAPI/SQLAlchemy/SQLite en `app/main.py`. Expone 14 rutas sin autenticación y puede iniciarse directamente en `127.0.0.1:8000` con recarga. No forma parte del arranque Node actual y sus dependencias no están instaladas, pero constituye código operativo ambiguo que no debe desplegarse accidentalmente.

## Módulos identificados

- Inicio de sesión, sesión y cierre de sesión.
- Tablero, alertas y notificaciones.
- Carga web y entrada por escáner.
- Listado, revisión, corrección, confirmación, reapertura y eliminación controlada de encuestas.
- Boleta digital, seguimiento y recuperación del huésped.
- Áreas, usuarios y asignaciones de áreas.
- Planes de acción e impacto financiero.
- Reportes, exportación, programación y entrega.
- Auditoría y salud del servicio.
- Soporte asistido por IA e integraciones externas.

## Resultados verificables

| Control | Resultado |
|---|---:|
| Compilación de producción | Aprobada |
| Pruebas automatizadas Node/integración | 57/57 aprobadas |
| Pruebas E2E Playwright | 12/12 aprobadas |
| Accesibilidad crítica/seria en login y tablero | 0 hallazgos Axe |
| Desbordamiento horizontal, 390×844 y 768×1024 | 0 píxeles |
| Dependencias npm | 0 vulnerabilidades conocidas, 79 dependencias auditadas |
| Dependencias Python fijadas | 0 vulnerabilidades conocidas en `openpyxl` y `et-xmlfile` |
| Integridad local | 21 tablas; 0 SHA duplicados; 0 correos duplicados sin distinguir mayúsculas; 0 relaciones encuesta-área huérfanas |
| Respaldo/restauración local | Aprobado en una base temporal y posteriormente eliminado |
| Incrementos concurrentes de límite | 100/100, sin actualizaciones perdidas |
| Cola sintética de encuestas | 100/100; 10,310 campos exactos; 0 errores/duplicados |
| Secretos dentro del artefacto final `.next` | 0 coincidencias en 706 archivos regulares |

## Controles que sí funcionan

- Las consultas revisadas parametrizan valores externos; no se halló inyección SQL explotable.
- React escapa la salida y las plantillas de notificación escapan contenido; no se halló XSS almacenado o reflejado explotable.
- La protección CSRF por origen y cookies `SameSite=Strict` bloqueó un origen cruzado de prueba.
- Los endpoints administrativos revisados validan el rol en el backend.
- Las contraseñas se almacenan con bcrypt (coste 12); los JWT validan algoritmo, emisor, audiencia, expiración y versión de sesión.
- El cierre de sesión ahora invalida la versión de sesión en base de datos.
- CSP, HSTS, `nosniff`, anti-frame, políticas de permisos y aislamiento de origen estuvieron presentes en respuestas reales.
- Los archivos se validan por tamaño, extensión, MIME, firma y decodificación; los PDF con acciones activas son rechazados.
- La bitácora impide `UPDATE` y `DELETE` mediante triggers.
- La migración, exportación, flujo de revisión y eliminación con auditoría funcionaron en pruebas locales.

## Endurecimiento aplicado el 13 de octubre

- MFA TOTP obligatorio antes de emitir una sesión completa, compatible con aplicaciones Authenticator.
- Secreto MFA cifrado con AES-256-GCM, protección contra reutilización y 10 códigos de recuperación almacenados únicamente como hash.
- Cambio de contraseña autenticado, contraseña temporal administrativa, revocación global de sesiones, activación/desactivación y reinicio MFA auditados.
- Verificadores limitados en backend a encuestas, archivos, reportes, alertas y planes correspondientes a sus áreas.
- Prueba adversarial real con dos áreas: acceso permitido al área asignada y denegado a la otra.
- ClamAV integrado en modo fail-closed; una producción remota no inicia si el antivirus no responde.
- IA documental y ATLAS deshabilitados por defecto. Un documento no se envía fuera de la institución sin dos banderas explícitas de habilitación/aprobación.
- FastAPI heredado bloqueado en producción y también bloqueado por defecto en desarrollo.
- Límites de carga, escáner, MFA y ATLAS centralizados en PostgreSQL.
- Constraints validados, gate de privilegios mínimos/TLS y comando `npm run security:readiness`.
- Blueprint actualizado a planes pagados, despliegue tras checks, PostgreSQL con pool, 100 GB y autoscaling de almacenamiento.

## Bloqueantes externos restantes

1. Debe provisionarse un ClamAV real y configurar `CLAMAV_HOST`; la integración está implementada, pero no existe el servicio en este entorno.
2. La base productiva debe usar un rol exclusivo sin `SUPERUSER`, `CREATEDB`, `CREATEROLE` ni replicación, además de TLS. El rol Docker local continúa siendo superusuario y por eso no es reutilizable.
3. Deben verificarse en la cuenta real alta disponibilidad, backups cifrados/inmutables, restauración, RPO/RTO, monitoreo, SIEM, WAF, DNS, certificado y rollback.
4. Todas las cuentas reales deberán registrar MFA; la cuenta local quedó deliberadamente sin el MFA temporal usado en pruebas para que el propietario la registre con su propia clave.
5. Si se decide activar OpenAI, todavía se requiere aprobación jurídica, DPA, residencia/retención y aceptación formal. Mientras tanto el sistema opera con revisión humana y no envía el documento.
6. Falta UAT institucional y carga sostenida en un staging equivalente a producción.

## Limitaciones

No se validaron DNS, certificado público, firewall, WAF, balanceador, réplica, backup administrado, SIEM, alertas reales, SMTP, Teams, WhatsApp, hardware de escáner, ClamAV real ni OpenAI con credenciales institucionales. FastAPI quedó bloqueado, no ejecutado. No hubo prueba destructiva de retención sobre información existente. Las cifras de rendimiento son de una estación local y no representan capacidad productiva.

Las evidencias están en [`evidencias/`](evidencias/) y el detalle de riesgos en [`VULNERABILIDADES.md`](VULNERABILIDADES.md).
