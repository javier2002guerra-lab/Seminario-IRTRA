# Vulnerabilidades y riesgos

**Escala:** Crítica, Alta, Media, Baja e Informativa.  
**Estado:** Abierta, Corregida, Mitigada o Requiere verificación de infraestructura.

## Resumen

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| IRTRA-001 | Alta | El alcance por área no se aplica a encuestas | Corregida y probada |
| IRTRA-002 | Alta | Documento y PII pueden enviarse íntegros al proveedor de IA | Mitigada: envío deshabilitado por defecto |
| IRTRA-003 | Alta | Despliegue declarado sin garantías empresariales | Parcial; infraestructura real pendiente |
| IRTRA-004 | Alta condicionada | Aplicación FastAPI heredada sin autenticación | Corregida: bloqueada en producción |
| IRTRA-005 | Media | Sin MFA/SSO ni ciclo completo de credenciales | Corregida para identidad local con MFA |
| IRTRA-006 | Media | Carga documental sin antivirus o CDR | Integración corregida; ClamAV real pendiente |
| IRTRA-007 | Media | Parte de los límites de solicitudes son locales al proceso | Corregida |
| IRTRA-008 | Media | Restricciones de dominio y migraciones insuficientes | Parcialmente corregida |
| IRTRA-009 | Media | Validación de entrada inconsistente en módulos secundarios | Parcialmente corregida |
| IRTRA-010 | Media | Confianza en IP indicada por el cliente | Corregida |
| IRTRA-011 | Media | Cierre de sesión no revocaba el JWT capturado | Corregida |
| IRTRA-012 | Media | PDF activo podía mostrarse con privilegios del origen | Corregida |
| IRTRA-013 | Media | Retención omitía información de recuperación | Corregida |
| IRTRA-014 | Media | Cachés de compilación conservaban secretos locales | Corregida |
| IRTRA-015 | Baja | Fallback del formulario podía enviar credenciales por URL | Corregida |
| IRTRA-016 | Baja | Identificador incorrecto en auditoría de eliminación | Corregida |
| IRTRA-017 | Media | Sin telemetría y respuesta a incidentes centralizadas | Abierta |

## Estado actualizado de hallazgos

### IRTRA-001 — Broken Access Control por ausencia de alcance de área

- **Severidad:** Alta; OWASP A01.
- **Ubicación:** `lib/scope.js:1` y consumidores en listados, detalle y descarga.
- **Evidencia:** `surveyScope()` devuelve incondicionalmente `{ where: "1=1", params: [] }`. La tabla `user_areas` se llena al crear usuarios, pero no participa en el filtro. Las rutas de mutación aceptan a cualquier `verificador`.
- **Impacto:** lectura y modificación horizontal de encuestas de otras áreas, incluyendo documentos y datos personales.
- **Estado:** corregida bajo la política conservadora autorizada: administrador global; verificador solo en sus áreas; un caso sin área únicamente es visible a su creador hasta asignación.
- **Evidencia posterior:** prueba con dos áreas y dos encuestas aprobada; rutas de archivos, edición, validación, seguimiento, recuperación, reportes, exportación y planes usan alcance backend.

### IRTRA-002 — PII enviada al servicio de IA sin minimización efectiva

- **Severidad:** Alta por confidencialidad y cumplimiento.
- **Ubicación:** `lib/analyzer.js:174-184`; configuración `pii_masking` en `lib/db.js:131`.
- **Evidencia:** el archivo se convierte en `input_file` o `input_image` y se entrega a `responses.create`; no hay transformación vinculada a `pii_masking`.
- **Impacto:** nombres, teléfonos, correos, firmas o comentarios sensibles de huéspedes pueden salir del perímetro institucional.
- **Estado:** mitigada de forma fail-closed. `EXTERNAL_AI_ENABLED=false` y `EXTERNAL_AI_PII_APPROVED=false` evitan el envío y fuerzan revisión humana.
- **Pendiente si se habilita:** aprobación jurídica y de seguridad, DPA, residencia/región, retención y evaluación formal del proveedor.

### IRTRA-003 — Plataforma declarada inadecuada para criticidad empresarial

- **Severidad:** Alta.
- **Ubicación:** `render.yaml:5`, `render.yaml:41`, `render.yaml:86`.
- **Evidencia inicial:** web y base usaban plan `free`, PostgreSQL declaraba `PGSSL=false`. En la instancia local, el rol `irtra` posee `SUPERUSER`, `CREATEROLE` y `CREATEDB`.
- **Impacto:** indisponibilidad, pérdida de datos, acceso excesivo y recuperación no garantizada.
- **Estado:** parcial. El Blueprint usa ahora recursos pagados, pool, almacenamiento autoscalable, TLS requerido y despliegue después de checks; el servidor rechaza roles administrativos en producción remota. HA, backups, SIEM, WAF y RPO/RTO todavía deben comprobarse en la cuenta real.
- **Corrección requerida:** plataforma empresarial, red privada, TLS validado, rol de mínimo privilegio, backups cifrados e inmutables, restauraciones periódicas, HA, monitoreo y plan de desastre.

### IRTRA-004 — Aplicación heredada sin autenticación

- **Severidad:** Alta si se despliega; actualmente contenida por no formar parte del arranque Node.
- **Ubicación:** `app/main.py:58-320`.
- **Evidencia:** 14 rutas GET/POST administran carga, catálogo, plantillas, escáner, registros y exportación sin dependencias de autenticación/autorización. `main()` activa `reload=True`.
- **Impacto:** acceso y modificación total si el servicio se publica o se expone mediante proxy.
- **Estado:** corregida como superficie desplegable: falla inmediatamente en producción y exige `ENABLE_LEGACY_FASTAPI=development-only` fuera de producción; `reload` fue retirado. Se recomienda eliminarla cuando el propietario confirme que no se necesita.

### IRTRA-005 — Identidad empresarial incompleta

- **Severidad:** Media, elevable según política institucional.
- **Evidencia inicial:** solo correo/contraseña; no había segundo factor ni ciclo de vida.
- **Impacto:** mayor probabilidad de toma de cuenta y operación manual insegura del ciclo de vida.
- **Estado:** corregida para cuentas locales: MFA TOTP obligatorio, recuperación de un uso, cambio/restablecimiento de contraseña, alta/baja, reinicio MFA y revocación global. OIDC/SAML continúa siendo una mejora recomendable si la institución entrega los metadatos de su IdP.

### IRTRA-006 — Falta análisis antimalware/CDR

- **Severidad:** Media.
- **Evidencia inicial:** existían validaciones de firma, MIME, decodificación y acciones PDF, pero no motor antivirus.
- **Impacto:** un formato válido puede contener carga maliciosa no cubierta por las reglas actuales.
- **Estado:** integración ClamAV implementada con INSTREAM, timeout y fallo cerrado; producción remota no inicia si el health check falla. Falta provisionar el servicio real y, si la política institucional lo exige, CDR adicional.

### IRTRA-007 — Limitación no distribuida

- **Severidad:** Media.
- **Evidencia inicial:** cargas/escáner mantenían contadores en memoria.
- **Impacto:** el límite se multiplica por instancia y se pierde al reiniciar.
- **Estado:** corregida; carga, escáner, login, MFA y ATLAS usan límites PostgreSQL. WAF sigue recomendado.

### IRTRA-008 — Integridad y migraciones débiles

- **Severidad:** Media.
- **Evidencia:** campos de rol, estado, prioridad, puntuaciones y banderas carecen de varios `CHECK`; el esquema se altera con un bloque idempotente en cada arranque y la tabla `migrations` no gobierna versiones.
- **Impacto:** estados imposibles, fallos de compatibilidad y despliegues/reversiones difíciles de auditar.
- **Corrección requerida:** migraciones versionadas, constraints, pruebas de upgrade/rollback y revisión de cascadas.

### IRTRA-009 — Validación inconsistente

- **Severidad:** Media.
- **Evidencia:** varias rutas compactas convierten IDs, fechas e importes con `Number()` o aceptan texto sin esquema central; algunos JSON malformados terminan en error genérico.
- **Impacto:** errores 500, datos inválidos y comportamiento desigual entre módulos.
- **Corrección requerida:** esquemas compartidos, límites explícitos, errores 400 uniformes y pruebas negativas por endpoint.

### IRTRA-017 — Observabilidad y respuesta a incidentes no centralizadas

- **Severidad:** Media.
- **Evidencia:** hay bitácora de negocio y health check, pero no se verificaron SIEM, métricas, trazas, alertas, guardias, retención de logs ni redacción centralizada.
- **Impacto:** detección tardía y análisis forense incompleto.
- **Corrección requerida:** logging estructurado sin PII, métricas/SLO, alertas, correlación, runbooks y pruebas de incidentes.

## Hallazgos corregidos y regresión

### IRTRA-010 — IP falsificable

Ahora solo se aceptan `X-Forwarded-For`/`X-Real-IP` con `TRUST_PROXY=true`; en conexión directa el servidor inyecta una cabecera interna desde el socket y sobrescribe cualquier valor del cliente. Prueba automatizada aprobada.

### IRTRA-011 — JWT vigente después de logout

El logout incrementa `session_version` dentro de una transacción y registra la invalidación. E2E verificó incremento de versión y cierre efectivo.

### IRTRA-012 — Visualización de PDF

La respuesta del documento aplica `Content-Security-Policy: sandbox; default-src 'none'` y `nosniff`; además continúa rechazando PDF con JavaScript/acciones conocidas. Pruebas aprobadas.

### IRTRA-013 — Retención incompleta

El trabajo de retención elimina ahora `guest_recovery` antes de anonimizar la encuesta. Se agregó prueba estática de regresión; no se ejecutó contra los datos existentes por seguridad.

### IRTRA-014 — Secretos en cachés de build

Un `postbuild` elimina `.next/cache` y `.next/dev`. La revisión final recorrió 639 archivos regulares restantes y obtuvo cero coincidencias con los secretos locales.

### IRTRA-015 — Credenciales en URL

El formulario usa `method="post"`, deja el correo vacío y declara `autocomplete`. La CSP solo permite `unsafe-eval` en desarrollo para que React no falle; producción conserva la política estricta.

### IRTRA-016 — Auditoría de solicitud de eliminación

Se corrigió el uso del ID retornado por PostgreSQL (`lastInsertRowid`) y el recorrido E2E confirmó la operación y su registro.

## Hallazgos no reproducidos

No se encontró evidencia explotable de inyección SQL, XSS, CSRF, traversal de rutas, SSRF o ejecución remota en la aplicación Node evaluada. Esto refleja el alcance y las pruebas realizadas, no una garantía absoluta de ausencia.
