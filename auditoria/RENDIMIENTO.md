# Rendimiento y concurrencia

## Entorno y advertencia

Las pruebas se ejecutaron únicamente en `https://127.0.0.1:3443`, con certificado autofirmado, Node/Next de producción y PostgreSQL 17 local en Docker. El generador deshabilitó la validación del certificado local. Estos números sirven para detectar regresiones evidentes; **no son un dimensionamiento productivo**.

## Resultados de carga

| Prueba | Duración/concurrencia | Throughput | p99 | Errores |
|---|---|---:|---:|---:|
| `/api/health` | 10 s / 20 | 594.5 req/s | 58 ms | 0 |
| `/login` | 10 s / 20 | 330.0 req/s | 90 ms | 0 |
| `/api/health` | 5 s / 30 | 574.4 req/s | 171 ms | 0 |
| `/login` | 5 s / 30 | 324.0 req/s | 128 ms | 0 |
| `/api/health`, corrida final | 5 s / 20 | 331.0 req/s | 218 ms | 0 |
| `/login`, corrida final | 5 s / 20 | 184.0 req/s | 173 ms | 0 |
| Cola sintética de encuestas | 100 trabajos / 8 workers | 208.55 encuestas/s | 60.66 ms por encuesta | 0 |

La variación entre corridas confirma que una estación compartida y una muestra corta no son una base suficiente para establecer SLO o capacidad. En la corrida instrumentada, el proceso de servidor promedió aproximadamente 5.5 % de CPU agregada sobre 20 procesadores lógicos y alcanzó 451 MB de working set. El contenedor PostgreSQL mostró 54.32 MiB y una instantánea de CPU de 0 %.

## Concurrencia e integridad

- 100 incrementos concurrentes contra el contador PostgreSQL produjeron 100 registros: sin actualización perdida.
- 100 encuestas sintéticas se procesaron con una cola limitada a 8 trabajos activos: 100/100 persistidas y verificadas, 1,400 calificaciones, 10,310 campos contrastados, 0 discrepancias y 0 duplicados.
- La cola observó p95 de 50.57 ms extremo a extremo por encuesta y p95 de 19.34 ms de persistencia. El proceso pasó de 47.07 MB a un pico RSS de 64.20 MB.
- Las 100 filas sintéticas y sus relaciones fueron eliminadas después de verificar los resultados; el control posterior encontró 0 filas residuales.
- Commit y rollback se verificaron en una prueba de integración.
- El pool de PostgreSQL tiene máximo 10 conexiones y timeouts configurados; no se probó agotamiento prolongado.
- No se realizaron cargas concurrentes de documentos de 50 MB, análisis de IA, exportaciones pesadas ni scheduler, para evitar consumo externo o efectos sobre datos.

La precisión del 100 % anterior corresponde a integridad de la canalización con verdad sintética conocida. **No demuestra precisión real de OCR o del modelo de IA**: el analizador utilizado fue un doble determinista local y no se enviaron imágenes a OpenAI. La evidencia reproducible está en `auditoria/evidencias/COLA_100_RESULTADO.json` y el comando es `npm run test:queue`.

## Cuellos de botella y riesgos

1. Los endpoints medidos son ligeros y no representan extracción con IA ni generación de reportes.
2. El pool de 10 conexiones puede limitar una instalación con múltiples trabajos largos.
3. Contadores en memoria de carga/escáner no coordinan varias réplicas.
4. Archivos se guardan en PostgreSQL como `BYTEA`; el crecimiento puede aumentar backup, I/O y costo.
5. `/tmp` es efímero en el despliegue declarado; aunque la copia canónica está en DB, el flujo debe validarse ante reinicios.
6. El escáner ahora evita rondas superpuestas y limita la concurrencia local mediante `SCAN_CONCURRENCY` (1 por defecto, máximo 8). El buzón local conserva archivos, pero todavía no existe un broker distribuido con reintentos durables para varias instancias.

## Prueba productiva requerida

Definir volumen esperado, mezcla de operaciones, tamaño documental, concurrencia pico y SLO. Ejecutar al menos una prueba de 30–60 minutos en un staging equivalente, con percentiles p50/p95/p99, errores, conexiones, locks, CPU, memoria, I/O y costo de IA. Hacer soak test y prueba de degradación del proveedor externo; nunca contra producción sin ventana y autorización.
