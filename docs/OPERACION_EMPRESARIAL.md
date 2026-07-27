# Operación empresarial y seguridad

## Puesta en producción

1. Use certificados emitidos por la autoridad certificadora institucional.
2. Genere `SESSION_SECRET` y `CSRF_SECRET` independientes, aleatorios y de al menos 64 caracteres.
3. Configure `COOKIE_SECURE=true`. Active `TRUST_PROXY=true` únicamente detrás de un proxy corporativo que reescriba los encabezados de origen.
4. Ejecute `npm run db:migrate` antes de desplegar una versión nueva.
5. Programe `npm run sla:monitor` cada cinco minutos y `npm run retention` una vez al día.
6. Respalde PostgreSQL y `private_uploads` cifrados; pruebe la restauración trimestralmente.

## SLA y escalamiento

El vencimiento se calcula al terminar el análisis usando el SLA más exigente de las áreas asignadas. Los casos a cuatro horas del vencimiento generan una alerta preventiva. Los vencidos generan una alerta crítica y un evento inmutable `SLA_ESCALATED`. El monitor es idempotente: puede ejecutarse repetidamente sin duplicar alertas.

## Controles incluidos

- HTTPS con TLS 1.2 como mínimo, HSTS, CSP, anti-framing y cookies `httpOnly`/`SameSite=Strict`.
- Validación de origen en operaciones mutables.
- Bloqueo progresivo persistente por combinación de IP y cuenta.
- Sesiones firmadas, con identificador único, expiración configurable y versión revocable.
- Roles y alcance por área aplicados en el servidor.
- Auditoría inmutable y retención configurable.

## Recomendaciones de infraestructura

Para una instalación corporativa use un gestor de secretos, PostgreSQL administrado o con réplica, almacenamiento cifrado, monitoreo centralizado y autenticación institucional con MFA. No publique PostgreSQL ni el directorio de documentos en Internet.
