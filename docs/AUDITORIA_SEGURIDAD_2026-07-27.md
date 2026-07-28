# Auditoría de seguridad del sistema IRTRA

Fecha de revisión: 27 de julio de 2026  
Alcance: aplicación web Node.js/Next.js, API, autenticación, sesiones, PostgreSQL, carga de documentos, exportaciones Excel, conector de escáner y configuración de Render.

## Resultado ejecutivo

El sistema fue sometido a revisión de código, análisis de dependencias, búsqueda de secretos, exploración antivirus, pruebas unitarias, migraciones y compilación de producción. No se detectaron secretos incorporados al repositorio ni código malicioso en `app`, `lib` o `scripts`.

La revisión corrigió controles de alto impacto:

- JWT restringidos a HS256, emisor y audiencia definidos.
- Una sola sesión activa por usuario y revocación de sesiones anteriores.
- Cookies `HttpOnly`, `Secure`, `SameSite=Strict` y no persistentes.
- Protección CSRF por origen para operaciones que modifican estado.
- Bloqueo de carga excesiva y límites de tiempo del servidor.
- Restricción de iframes, HSTS, CSP, COOP, CORP y cabeceras adicionales.
- Validación de extensión, MIME, firma, dimensiones y tamaño de archivos.
- Rechazo de PDF con JavaScript, acciones automáticas o adjuntos incrustados.
- Visualización de PDF dentro de un iframe aislado.
- Archivos almacenados con nombres aleatorios y fuera de contenido público.
- Prevención de fórmulas maliciosas en XLSX y XLSM.
- Eliminación completa del documento y datos personales al vencer la retención.
- Registro de auditoría protegido contra actualización y eliminación.
- Parámetros SQL enlazados y límites de conexión/consulta.
- Contraseñas nuevas de 14 a 128 caracteres con requisitos de complejidad.
- Desactivación del optimizador de imágenes no utilizado y bloqueo de su ruta.
- Eliminación de ExcelJS y su cadena de dependencias vulnerables.

## Evidencias ejecutadas

- Microsoft Defender: sin amenazas en `app`, `lib` y `scripts`.
- Historial Git: cero coincidencias de claves OpenAI o llaves privadas.
- Pruebas: 21 aprobadas, 0 fallidas.
- Migración PostgreSQL: correcta.
- Compilación optimizada: correcta.
- Exportación estadística: 9 hojas válidas y protección contra inyección de fórmulas comprobada.
- Exportación gerencial: protección contra fórmulas maliciosas comprobada.
- Cabeceras y límites HTTP verificados localmente.

## Riesgos residuales y requisitos antes de conectarlo a la red empresarial

1. `npm audit` aún identifica la copia opcional de `sharp` incluida por Next.js. El sistema bloquea `/_next/image`, configura imágenes sin optimización y no llama esa copia; el procesamiento de documentos usa `sharp 0.35.3`, que contiene las correcciones. Se debe actualizar Next.js tan pronto publique una versión que incorpore `sharp >=0.35.0`.
2. Render Free es apropiado para demostración, no para producción empresarial. La instalación final debe usar infraestructura corporativa, copias de seguridad, monitoreo, alta disponibilidad y almacenamiento cifrado.
3. El administrador debe usar MFA o, preferiblemente, autenticación corporativa OIDC/SAML antes de producción. Esta versión usa correo y contraseña.
4. Debe colocarse detrás de firewall/WAF o proxy inverso corporativo, limitar el acceso por red/VPN y aplicar límites distribuidos; los límites internos por proceso no sustituyen un WAF.
5. PostgreSQL debe usar TLS (`PGSSL=true`) cuando la conexión salga del host o de una red privada confiable. La cuenta de base debe ser exclusiva y de privilegio mínimo.
6. Deben habilitarse antivirus en tiempo real y análisis de cada archivo en el servidor definitivo. Durante esta auditoría Microsoft Defender estaba habilitado, pero la protección en tiempo real del equipo de desarrollo aparecía desactivada.
7. Debe acordarse contractualmente el tratamiento de datos enviados al servicio de análisis. Las solicitudes usan `store: false`, pero la empresa debe aprobar proveedor, región, retención y clasificación de datos.
8. Deben configurarse rotación de secretos, respaldo/restauración probado, alertas, sincronización horaria, centralización de logs y procedimiento de respuesta a incidentes.
9. Debe ejecutarse una prueba de penetración autenticada desde la infraestructura final. La revisión de código no reemplaza una prueba dinámica externa.

## Configuración mínima del servidor empresarial

- Linux LTS actualizado y Node.js compatible.
- Usuario de servicio sin privilegios administrativos.
- Solo HTTPS TLS 1.2/1.3; HTTP redirigido a HTTPS.
- Servicio no expuesto directamente: proxy inverso corporativo delante.
- PostgreSQL no publicado a Internet.
- Secretos inyectados desde el gestor corporativo; nunca en archivos o Git.
- `NODE_ENV=production`, `COOKIE_SECURE=true`, `ALLOW_LOCAL_EMBED=false`.
- `SESSION_SECRET` y `CSRF_SECRET` aleatorios con al menos 256 bits.
- `APP_BASE_URL` con HTTPS.
- `OPENAI_API_KEY` y `DATABASE_URL` obligatorios.
- Copias de seguridad cifradas y pruebas periódicas de restauración.
- Antivirus/EDR, monitoreo, alertas y registros enviados al SIEM.

## Referencias de control

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## Dictamen

La base quedó considerablemente endurecida y es adecuada para continuar a una evaluación empresarial controlada. No debe describirse como “impenetrable”. La autorización final para producción queda condicionada a resolver o aceptar formalmente los riesgos residuales, incorporar MFA/SSO, ejecutar una prueba de penetración sobre el servidor definitivo y completar los controles operativos de la empresa.
