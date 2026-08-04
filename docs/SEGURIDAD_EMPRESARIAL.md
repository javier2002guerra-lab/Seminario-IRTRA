# Seguridad empresarial de IRTRA ENCUESTAS

## Controles implementados

- Consultas PostgreSQL parametrizadas y tiempos máximos de ejecución.
- Autorización por rol en cada operación sensible y administración exclusiva para administradores.
- Sesiones JWT firmadas, expirables y revocables; cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict` y prioridad alta.
- Bloqueo de fuerza bruta por combinación IP/cuenta y por cuenta, persistido en PostgreSQL.
- Protección CSRF por origen exacto permitido y cookies del mismo sitio.
- CSP por solicitud con nonce, `strict-dynamic`, bloqueo de objetos, marcos y orígenes externos.
- HSTS, anti-clickjacking, `nosniff`, políticas de permisos, aislamiento de origen y ausencia del encabezado de tecnología.
- Límites de cuerpo específicos, rechazo de transferencia sin longitud verificable y límites de frecuencia distribuidos para ATLAS.
- Archivos validados por firma real, MIME, estructura, tamaño, dimensiones y acciones activas de PDF.
- Neutralización de fórmulas en Excel y escape HTML en notificaciones internas.
- Mensajes de error externos genéricos, registros de auditoría inmutables y secretos fuera del repositorio.
- Dependencias bloqueadas por `package-lock.json` y verificadas con `npm audit`.

## Requisitos obligatorios en el servidor empresarial

1. Usar HTTPS 1.2 o superior y redirigir todo HTTP a HTTPS.
2. Generar secretos independientes de al menos 32 bytes aleatorios para sesión, CSRF y conector de escáner.
3. Ejecutar la aplicación y PostgreSQL con usuarios sin privilegios administrativos y bases separadas por ambiente.
4. Restringir PostgreSQL a red privada; si cruza redes, activar TLS con validación de certificado (`PGSSL=true`).
5. Guardar secretos en el gestor de secretos de la empresa, nunca en archivos, imágenes Docker o repositorios.
6. Colocar WAF y limitación de tráfico delante del servicio; permitir el panel administrativo solamente desde VPN o rangos corporativos cuando la operación lo admita.
7. Activar copias cifradas, pruebas periódicas de restauración, retención aprobada y rotación de claves.
8. Centralizar logs y alertar por bloqueos repetidos, errores 5xx, cambios de usuarios y exportaciones inusuales.
9. Ejecutar `npm ci`, `npm audit --audit-level=high`, pruebas y análisis SAST en cada despliegue.
10. Realizar una prueba de penetración independiente antes de producción y después de cambios relevantes.

## Riesgo residual

Ningún sistema conectado puede prometer riesgo cero. Estos controles reducen la superficie conocida; la seguridad final también depende de identidad corporativa, red, parches del sistema operativo, configuración del proxy, credenciales y monitoreo continuo. Para información sensible se recomienda integrar MFA/SSO corporativo antes de la aprobación final de producción.
