# Dictamen final actualizado

Actualización del 29/10/2026: consulte [validación local para la presentación](VALIDACION_LOCAL_2026-10-29.md) para los resultados y evidencias de esta computadora. Las cifras siguientes pertenecen a la auditoría del 13/10/2026.

## **NO APTO PARA PRODUCCIÓN TODAVÍA — CÓDIGO CANDIDATO A STAGING**

Al 13 de octubre de 2026, los bloqueantes principales de código identificados en la primera auditoría fueron corregidos y cuentan con regresión. Sin embargo, no es técnicamente honesto declarar el sistema apto para datos reales hasta que la institución proporcione y valide la infraestructura externa obligatoria.

## Controles incorporados

- MFA TOTP obligatorio antes de crear una sesión completa.
- Secreto MFA cifrado con AES-256-GCM, códigos de recuperación con hash y rechazo de reutilización TOTP.
- Cambio y restablecimiento de contraseña, alta/baja, reinicio MFA y revocación de sesiones.
- Autorización por área en backend para encuestas, documentos, mutaciones, reportes, alertas, exportaciones y planes.
- Integración ClamAV fail-closed y comprobación de salud antes de arrancar una producción remota.
- IA documental y soporte externo deshabilitados por defecto; el documento no sale del perímetro sin aprobación explícita.
- FastAPI heredado bloqueado en producción.
- Límites distribuidos en PostgreSQL.
- Constraints validados, control de rol PostgreSQL sin privilegios administrativos y exigencia TLS.
- Blueprint sin planes gratuitos y puerta automatizada `npm run security:readiness`.

## Evidencia final

- Build de producción: aprobado.
- Suite Node/integración: **57/57**.
- Cola sintética: **100/100**, 10,310 campos comparados sin discrepancias y 0 duplicados; no equivale a validación OCR/IA real.
- Playwright sobre artefacto final: **12/12**, incluido MFA.
- Dependencias conocidas: 0 vulnerabilidades reportadas por npm/pip-audit en el alcance.
- Prueba de separación por áreas: aprobada.
- ClamAV simulado: archivo limpio permitido y detección bloqueada.
- Restauración PostgreSQL local: aprobada.
- Artefacto: 706 archivos regulares revisados, 0 coincidencias con secretos locales.
- Responsive y accesibilidad en pantallas probadas: aprobados.

## Condiciones externas obligatorias

1. Provisionar ClamAV actualizado y accesible únicamente por red privada.
2. Crear un rol PostgreSQL exclusivo sin `SUPERUSER`, `CREATEDB`, `CREATEROLE` o replicación; habilitar TLS.
3. Configurar HA, backups cifrados/inmutables y ejecutar restauración desde el mecanismo productivo.
4. Definir y probar RPO/RTO, monitoreo, SIEM, WAF, alertas y rollback.
5. Configurar DNS y certificado público, y verificar la cadena TLS real.
6. Registrar MFA con dispositivos institucionales para todas las cuentas reales.
7. Mantener al menos dos administradores activos con MFA para recuperación de contingencia.
8. Ratificar formalmente la política “administrador global / verificador por áreas”.
9. Completar UAT y carga sostenida en staging equivalente.
10. Mantener la IA externa deshabilitada hasta contar con DPA, evaluación de privacidad y aprobación formal.
11. Ejecutar `npm run security:readiness` y obtener `ready: true` antes de abrir tráfico.

## Conclusión

El repositorio puede entregarse como **candidato endurecido para staging**. No debe recibir información personal real mientras cualquiera de las condiciones anteriores siga pendiente. Una vez satisfechas y verificadas en la infraestructura final, corresponde una revisión corta de cierre; si el gate, UAT, restore y pruebas de seguridad pasan, el dictamen podría cambiar a **APTO CON OBSERVACIONES** o **APTO PARA PRODUCCIÓN**.

Ninguna auditoría constituye garantía absoluta de seguridad; este dictamen refleja únicamente el código, entorno y evidencias disponibles.
