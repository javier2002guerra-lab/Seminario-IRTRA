# IRTRA Calidad IA - Version Node.js

Sistema Express con HTML por vista, PostgreSQL, pgAdmin 4, JWT en cookies seguras, roles, HTTPS, OpenAI y exportacion gerencial en `.xlsm` preservando las plantillas adjuntas.

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- pgAdmin 4
- Certificado HTTPS real para produccion

## Base de datos

En pgAdmin 4 crea una base de datos:

```sql
CREATE DATABASE irtra_calidad_ia;
```

Copia `.env.node.example` como `.env.node` y ajusta:

```env
DATABASE_URL=postgres://postgres:tu_clave@localhost:5432/irtra_calidad_ia
JWT_SECRET=un_secreto_largo_y_privado_de_64_caracteres_minimo
COOKIE_SECRET=otro_secreto_largo
OPENAI_API_KEY=tu_token_openai
```

Genera secretos seguros con:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

## Arranque

```bash
npm install
npm start
```

El servidor inicia en:

```text
https://localhost:3443
```

La primera ejecucion crea tablas y siembra el superusuario definido en `.env.node`:

```env
SUPERUSER_EMAIL=superusuario@irtra.local
SUPERUSER_PASSWORD=Cambia_Esta_Clave_2026!
```

## Seguridad incluida

- Login obligatorio en todas las vistas internas.
- JWT firmado en cookie `httpOnly`, `secure` y `sameSite=strict`.
- CSRF propio con cookie firmada y comparacion segura.
- Rate limit en login y carga de archivos.
- Cabeceras Helmet, HSTS y `frame-ancestors 'none'`.
- Roles: `superusuario`, `admin`, `user`.
- Vistas privadas con `Cache-Control: no-store`.
- Script frontend para evitar volver con atras/adelante a pantallas cacheadas.

## Reportes Excel

Las plantillas adjuntas ya quedaron copiadas en:

```text
data/excel_templates/
```

La exportacion copia la plantilla `.xlsm` y edita celdas internas del Office XML, conservando macros, graficos, estilos y hojas existentes.

## Produccion

Sustituye los certificados de `certs/` por certificados reales y usa un proxy corporativo o balanceador que mantenga HTTPS extremo a extremo. Cambia todos los secretos antes de ponerlo en red.
