# Despliegue seguro

## Variables obligatorias

- Mantenga `BIND_HOST=127.0.0.1`.
- Use secretos independientes y aleatorios de 64 caracteres o más.
- Use una contraseña única y larga para el superusuario y PostgreSQL.
- Active `TRUST_PROXY=true` únicamente con el proxy de este servidor configurado para reemplazar `X-Forwarded-For`.
- No copie `.env.local` al repositorio ni a una imagen Docker.

## Red

- Publique solamente 80/TCP y 443/TCP.
- Restrinja SSH a una IP administrativa o VPN.
- No publique 3443, 5434, 2375 ni 2376.
- Mantenga PostgreSQL y la aplicación ligados a loopback.
- Use el ejemplo `NGINX_PRODUCCION.conf.example` como punto de partida.

## Operación

- Cifre el disco y los respaldos.
- Ejecute respaldos automáticos de PostgreSQL y `private_uploads` y pruebe restauraciones.
- Ejecute `npm audit`, pruebas y compilación antes de desplegar.
- Centralice alertas y revise intentos fallidos, descargas, exportaciones y cambios administrativos.
- Aplique actualizaciones del sistema operativo y Node.js regularmente.
- Rote secretos después de cualquier exposición o copia accidental.
