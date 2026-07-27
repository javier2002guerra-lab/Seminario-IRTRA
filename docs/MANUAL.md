# Manual breve por rol

- **Superusuario:** administra usuarios, áreas y configuración; consulta auditoría. La bitácora no puede modificarse ni eliminarse.
- **Administrador de Tecnologías:** configura secretos, OpenAI, HTTPS, respaldos y salud técnica.
- **Calidad:** consulta todos los casos, valida la clasificación, documenta el motivo y exporta resultados.
- **Responsable de área:** atiende los casos asignados a su área y registra seguimiento/resolución.
- **Auditor:** consulta registros, indicadores e historial sin modificar información.

## Flujo principal

1. Ingrese por HTTPS.
2. En **Carga documental**, seleccione uno o varios PDF/JPG/JPEG/PNG.
3. Consulte el resultado en **Encuestas**. Los críticos, ambiguos y de baja confianza aparecen en **Revisión humana**.
4. Abra el caso, compare la propuesta, corrija lo necesario e indique el motivo obligatorio.
5. Descargue el original o exporte resultados según sus permisos.

## Administración y conservación

El superusuario crea áreas desde **Áreas y responsables** y usuarios desde **Usuarios**. Para responsables de área, marque sus áreas autorizadas. `npm run retention` purga originales de casos cerrados vencidos y anonimiza su contenido, conservando trazabilidad mínima.
