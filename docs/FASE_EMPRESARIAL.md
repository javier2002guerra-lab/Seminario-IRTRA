# Fase empresarial de IRTRA ENCUESTAS

## Informes y alertas internas

El planificador revisa cada hora las programaciones activas en la zona `America/Guatemala`. PostgreSQL aplica un bloqueo transaccional para que varias instancias no dupliquen los envíos.

Los canales disponibles son SMTP, webhook de Microsoft Teams y WhatsApp Cloud API. `INTERNAL_WHATSAPP_RECIPIENTS` debe contener exclusivamente números corporativos de responsables internos. El sistema no envía mensajes a huéspedes.

Las credenciales se configuran como secretos de Render. La pantalla **Integraciones** muestra cuáles canales están listos sin revelar sus valores.

## Impacto financiero

Un responsable registra un ahorro estimado en el plan. Solo un Administrador puede convertirlo en ahorro validado, documentando el importe real y la evidencia contable. El panel ejecutivo suma únicamente `actual_savings` con estado financiero `Validado`.

## Pronóstico

El pronóstico usa una regresión lineal sobre los últimos 12 meses de quejas. Muestra pendiente, R² y confianza. Es una señal orientativa; no sustituye el juicio gerencial.

## Alta disponibilidad

- Sesiones stateless firmadas y datos persistentes en PostgreSQL.
- Endpoint de readiness `/api/health` con comprobación real de base de datos.
- Cierre ordenado ante `SIGTERM`.
- Planificador protegido contra duplicación entre instancias.
- Prueba de carga disponible con `npm run test:load`.

La redundancia efectiva de dos o más instancias requiere cambiar el plan de Render y configurar escalamiento en su panel. No se activa automáticamente porque genera costos externos.

## DNS

Render declara `irtraencuestas.org`, pero el DNS debe apuntar al servicio desde el proveedor que administra el dominio. El código no contiene credenciales del registrador y no debe almacenarlas.
