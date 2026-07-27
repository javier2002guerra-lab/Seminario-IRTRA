# Matriz de aceptación

| Prueba | Cobertura | Estado |
|---|---|---|
| Formato válido/firma real | Automatizada | Aprobada |
| Extensión falsa/MIME discordante | Automatizada | Aprobada |
| Archivo vacío/grande | Automatizada | Aprobada |
| Hash duplicado | Integración de API/índice único | Implementada |
| PDF corrupto/imagen ilegible | Decodificación automatizada | Aprobada |
| Queja crítica/baja confianza | Regla de cierre automático | Implementada |
| Varias áreas | Relación muchos-a-muchos y corrección UI | Implementada |
| Timeout/respuesta inválida OpenAI | Captura, estado Error, auditoría | Implementada |
| Usuario sin permisos | Rutas servidor | Implementada |
| Orden de prioridades | Automatizada | Aprobada |
| Auditoría inmutable | Automatizada | Aprobada |
| Corrección humana | API e historial | Implementada |
| Exportación gerencial interna `.xlsx` | Generación, estructura y descarga | Implementada; `.xlsm` no aplica porque no existe VBA |
| Login, navegación, usuarios, áreas y logout | Playwright HTTPS | Aprobada |
| Cierre de caso crítico | Política y API | Aprobada |
