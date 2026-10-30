# Checklist de producción

Estados: **Cumplido**, **Pendiente**, **Bloqueante**, **No verificado**.

## Aplicación y seguridad

| Requisito | Estado | Observación |
|---|---|---|
| Build reproducible de producción | Cumplido | Ejecutado satisfactoriamente |
| Dependencias sin vulnerabilidades conocidas | Cumplido | npm y dos paquetes Python auditados el 12/10/2026 |
| Secretos fuera de Git y artefacto | Cumplido | Exclusiones activas; 0 coincidencias en `.next` final |
| Contraseña inicial segura obligatoria | Cumplido | Validación de producción agregada |
| HTTPS y cookies seguras en configuración | Cumplido en código | Certificado público aún no verificado |
| Cabeceras de seguridad | Cumplido | Verificadas dinámicamente |
| CSRF | Cumplido en casos probados | Origen cruzado rechazado |
| SQLi/XSS básicos | Cumplido en alcance | Sin vector explotable encontrado |
| Revocación de sesión al logout | Cumplido | `session_version` invalidada |
| Autorización administrativa backend | Cumplido | Endpoints revisados la exigen |
| Alcance de encuestas por área | Cumplido en código | Administrador global; verificador por áreas; prueba adversarial aprobada |
| MFA | Cumplido en código | TOTP obligatorio, recuperación, cifrado y antirreplay; falta enrolamiento institucional |
| SSO institucional | Pendiente opcional | Requiere metadatos OIDC/SAML del IdP institucional |
| Ciclo de vida de cuentas | Cumplido | Cambio/reset/revocación/alta/baja/reinicio MFA |
| Dos administradores de contingencia con MFA | Bloqueante externo | El gate exige al menos dos; la base local solo tiene uno |
| Matriz RBAC ratificada por negocio | Pendiente | Se implementó política conservadora; falta firma institucional |
| Antivirus/CDR y cuarentena | Bloqueante externo | ClamAV integrado y fail-closed; falta servicio real; CDR según política |
| Minimización de PII antes de IA | Cumplido por no envío | IA externa deshabilitada; activar exige aprobación explícita |
| DPA/privacidad/residencia del proveedor IA | **Bloqueante** | Decisión institucional pendiente |
| FastAPI heredado retirado o protegido | Cumplido | Bloqueo de arranque productivo y opt-in de desarrollo |
| Validación uniforme de entrada | Pendiente | Adoptar esquemas por endpoint |
| Límites distribuidos | Cumplido en aplicación | PostgreSQL para login, MFA, carga, escáner y ATLAS |
| Auditoría inmutable | Cumplido | Triggers verificados |

## Base de datos y continuidad

| Requisito | Estado | Observación |
|---|---|---|
| PostgreSQL 17 compatible | Cumplido local | Migración y aplicación funcionaron |
| Integridad básica | Cumplido local | Sin duplicados/huérfanos observados |
| Constraints de dominio | Parcial | Roles, flags, confianza y tamaño validados; ampliar a todos los estados |
| Migraciones versionadas | Parcial | Nueva versión registrada; falta separar completamente el DDL histórico |
| Rol de servicio de mínimo privilegio | **Bloqueante** | El rol local evaluado es superusuario |
| TLS de base con validación | Cumplido en configuración / No verificado en servicio | El blueprint exige `PGSSL_MODE=require`; falta comprobar la conexión productiva real |
| Backup local restaurable | Cumplido local | Restauración temporal aprobada |
| Backup productivo cifrado e inmutable | **No verificado** | Configuración no disponible |
| RPO/RTO aprobados | Bloqueante | No definidos/probados |
| HA/réplica/failover | Bloqueante | No demostrado |
| Prueba de desastre | Bloqueante | No ejecutada |
| Retención aprobada y job programado | Pendiente | Código corregido; política/ejecución real pendientes |

## Infraestructura y operación

| Requisito | Estado | Observación |
|---|---|---|
| Separación dev/test/prod | Pendiente | Variables existen; arquitectura real no demostrada |
| Plataforma con SLA institucional | No verificado | Blueprint ya no usa planes gratuitos; contrato/SLA real pendiente |
| DNS y certificado público | No verificado | Solo TLS local autofirmado |
| Red privada/firewall | No verificado | No se inspeccionó infraestructura real |
| WAF y protección DDoS | No verificado | Recomendado |
| Proxy confiable configurado | Pendiente | Código endurecido; validar saltos reales |
| Gestor de secretos y rotación | No verificado | No usar archivos locales en producción |
| Monitoreo, SLO y alertas | **Bloqueante** | Health existe; plataforma operativa no verificada |
| SIEM y respuesta a incidentes | Bloqueante | Runbooks y centralización pendientes |
| Logs sin PII y con retención | Pendiente | Diseñar y verificar |
| Deploy gradual/rollback | Bloqueante | No demostrado |
| Scheduler con exclusión mutua | Pendiente | Validar en múltiples instancias |
| Almacenamiento duradero | Bloqueante | `/tmp` es efímero; dimensionar DB/objetos |

## Calidad y aceptación

| Requisito | Estado | Observación |
|---|---|---|
| 57 pruebas automatizadas | Cumplido | 57/57 |
| Cola local acotada | Cumplido en aplicación | 100/100 trabajos sintéticos; concurrencia configurable 1–8 y sin rondas superpuestas |
| Precisión OCR/IA con 100 escaneos reales | Pendiente | Requiere corpus anonimizado y etiquetado por revisores humanos |
| 12 recorridos E2E | Cumplido | 12/12 |
| Accesibilidad crítica/seria | Cumplido en pantallas probadas | Axe: 0 |
| Responsive teléfono/tableta | Cumplido en pantallas probadas | 0 px overflow |
| Firefox/WebKit/dispositivos reales | Pendiente | No ejecutado |
| Carga sostenida representativa | Pendiente | Solo endpoints ligeros y pruebas cortas |
| UAT institucional | **Bloqueante** | Usuarios/criterios de aceptación no disponibles |
| Escáner físico | No verificado | Sin hardware |
| OpenAI sandbox institucional | No verificado | Sin credenciales/aprobación |
| SMTP/Teams/WhatsApp sandbox | No verificado | Sin credenciales/aprobación |
| Documentación de operación | Parcial | Existe, pero hay documentos heredados contradictorios |

## Puerta mínima recomendada

No pasar a producción hasta provisionar ClamAV, rol PostgreSQL mínimo con TLS, backup/restore administrado, HA/monitoreo/alertas, DNS/certificado, UAT y staging equivalente. Antes de habilitar tráfico ejecute `npm run security:readiness`; debe devolver `ready: true`. Cada bloqueo debe tener propietario, fecha, evidencia y aceptación formal del riesgo residual.
