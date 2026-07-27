# Diagnóstico y arquitectura final

## Estado inicial verificado

La única implementación existente era FastAPI/Jinja/SQLAlchemy. Incluía carga, hash, análisis OpenAI con `store: false`, panel básico y exportación basada en plantillas. No había autenticación, roles, sesiones, CSRF, auditoría, corrección humana, catálogo de áreas completo, estados operativos ni pruebas. La interfaz Node descrita en `README_NODE.md` no existía: faltaba completamente el directorio `src/`. Esta computadora tampoco tiene un intérprete Python instalado.

Se encontraron archivos generados o sensibles que no deben versionarse: `.env`, `.env.node`, `.DS_Store`, `node_modules/`, `*.egg-info/`, `__pycache__/`, bases SQLite, documentos cargados y certificados privados. Se añadieron exclusiones; los archivos existentes no se borraron para preservar información del usuario.

## Decisión técnica

La arquitectura final es una sola aplicación Next.js full-stack con PostgreSQL 17 en Docker. La UI usa App Router y React; las rutas de servidor concentran autenticación, autorización, carga, OpenAI y exportación. PostgreSQL se expone solo en localhost y conserva sus datos en un volumen Docker. Los archivos FastAPI son referencia histórica y no forman parte del arranque final.

## Riesgos iniciales corregidos

- Rutas totalmente públicas y sin control de acceso.
- Archivos validados por nombre/MIME declarado, pero no por firma real.
- Sin protección de sesiones ni bloqueo de intentos.
- Sin auditoría inmutable ni registro de correcciones.
- Archivos `.env` reales presentes en el directorio.
- Dependencia `xlsx` con vulnerabilidad alta; fue sustituida por `exceljs`.

## Pendientes declarados

- La preservación de una plantilla `.xlsm` gerencial solo puede validarse cuando la plantilla real esté disponible en `data/excel_templates`; la exportación actual produce `.xlsx` seguro.
- El certificado local es autofirmado. Para red corporativa debe reemplazarse por uno emitido por la CA institucional.
- Para producción deben rotarse la contraseña PostgreSQL y los secretos de sesión antes de permitir acceso de red.
- La precisión IA requiere un conjunto humano de referencia; el esquema conserva original, modelo, prompt y correcciones para calcularla al acumular revisiones.

## Archivos excluidos o retirados de la ejecución

`node_modules/`, `.next/`, certificados privados, volúmenes/datos, documentos originales, `.env`, `.env.node`, cachés Python, `*.egg-info`, reportes Playwright y archivos del sistema están excluidos. Los archivos SQLite residuales fueron eliminados después de verificar que contenían 0 encuestas, 0 correcciones y 0 seguimientos. No se eliminó ninguna plantilla: no se encontró ningún `.xlsm` en el proyecto.

## Segunda fase verificada

- Usuarios y cinco roles, asociación usuario–área y alcance restringido.
- Áreas administrables con contacto, responsable y SLA.
- Estados, asignación, seguimiento y fecha de resolución.
- Extracción de datos generales, respuestas numeradas, comentarios y servicios.
- Dashboard por área, prioridad, fecha, servicios y temas.
- Filtros por fecha, área, prioridad, categoría, servicio y estado.
- Retención mediante `npm run retention`, con purga del original y anonimización.
- Rate limit de login/carga, logout auditado y HSTS.
