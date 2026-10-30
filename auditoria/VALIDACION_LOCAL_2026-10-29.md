# Validación para la presentación local del 30 de octubre de 2026

Se corrigió y comprobó el proyecto en esta computadora con PostgreSQL local independiente, Chrome y Microsoft Excel. Los documentos y credenciales de prueba están separados de la configuración original. El servidor de demostración está limitado a `127.0.0.1:3444`.

## Resultados comprobados

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas Node e integración PostgreSQL/Python | 75 aprobadas, 0 fallidas | `evidencias/UNIT_RESULTADO.txt` |
| Cypress, Chrome, compilación de producción | 8 escenarios aprobados | `evidencias/CYPRESS_RESULTADO.json` |
| Playwright, accesibilidad y vistas móviles | 12 pruebas aprobadas | `evidencias/PLAYWRIGHT_RESULTADO.txt` |
| Compilación Next.js 16.4.3 | Aprobada | `evidencias/BUILD_RESULTADO.txt` |
| Matriz de exportación Excel | 672 encuestas sintéticas; 1,332 celdas comprobadas | `evidencias/EXCEL_MATRIZ_RESULTADO.json` |
| Integridad XLSM | VBA, gráficos, dibujos y controles conservados; 993 fórmulas estructurales verificadas | `evidencias/EXCEL_RESULTADO.json` |
| Microsoft Excel 16.0 | Apertura y recálculo; 0 errores de fórmula; 5 totales contrastados | `evidencias/EXCEL_NATIVO_RESULTADO.json` |
| Cola de persistencia | 100 documentos sintéticos, concurrencia 8; 10,310 campos sin discrepancias | `evidencias/COLA_100_RESULTADO.json` |
| Auditoría npm | 0 vulnerabilidades reportadas | `evidencias/NPM_AUDIT_RESULTADO.json` |
| Carga local, 10 solicitudes concurrentes, 5 segundos por ruta | Salud: p99 421 ms; acceso: p99 284 ms; 0 errores | `evidencias/CARGA_RESULTADO.txt` |

Las pruebas de carga cubren `/api/health` y `/login`. La cola utiliza resultados conocidos y un analizador determinista. Estos resultados miden funcionamiento e integridad de persistencia; no son una medición de exactitud OCR, clasificación de encuestas reales ni rendimiento con IA externa.

## Correcciones de esta revisión

- **Excel:** «Sin dato», «Sin respuesta», «No aplica» y otras respuestas ausentes ya no se cuentan como afirmaciones. Se conservan los ceros iniciales de los datos transcritos.
- **Fórmulas:** se restauran las fórmulas institucionales que las tablas de comentarios y rankings sobrescribían. Las etiquetas siguen las referencias de las fórmulas entre hojas. Las divisiones conservan su expresión con protección `IFERROR` para secciones vacías. La aritmética numérica histórica de entrada se sustituye por los valores actuales; la plantilla original permanece intacta.
- **Compatibilidad Excel:** se conservan las declaraciones de espacios de nombres, incluso las utilizadas solo en `mc:Ignorable` y `Requires`. Su pérdida impedía abrir en Microsoft Excel un ZIP que otras bibliotecas aceptaban. El generador comprueba esta condición antes de entregar el archivo.
- **Macros y botones:** el proyecto VBA y los recursos de gráficos, controles y dibujos se comparan con la plantilla aprobada. La comprobación nativa se realizó en modo de lectura, con macros deshabilitadas, sin guardar cambios. No se certificó la ejecución del código VBA.
- **Exportación consistente:** las encuestas confirmadas y sus calificaciones se leen en una misma sentencia PostgreSQL para evitar mezclar estados durante una edición concurrente.
- **Análisis:** se validan tipos, categorías, prioridades, confianza, respuestas 1–14, áreas, evidencias y servicios duplicados. El puntaje y el indicador negativo se derivan de la calificación, en lugar de aceptar cálculos del modelo. Las advertencias obligan a revisión humana. El documento se trata como datos, no como instrucciones para el analizador.
- **Indicadores:** los errores de procesamiento quedan fuera de los indicadores principales. Una felicitación frecuente no genera un plan preventivo y un servicio sin calificaciones negativas no se presenta como problema prioritario.
- **Edición y seguimiento:** entradas malformadas, fechas imposibles, calificaciones duplicadas, satisfacciones fuera de rango y ahorros inválidos se rechazan. Confirmar/reabrir una encuesta se ejecuta de forma transaccional. Las modificaciones quedan pendientes de nueva confirmación.
- **Interfaz:** los botones de carga, guardado y salida esperan a que sus controladores estén preparados; los formularios no envían datos mediante GET. El estado del escáner refleja su configuración real.
- **Seguridad:** regresión de MFA, bloqueo de intentos, revocación de sesiones, origen de solicitudes, permisos por área, archivos privados, auditoría inmutable y entradas inválidas. La puerta de producción verifica las exigencias de producción incluso cuando se invoca desde desarrollo.
- **Dependencias:** Next.js 16.4.3, sharp 0.35.5, node-forge 1.4.2 y nodemailer 10.3.1, con lockfile actualizado y dependencias transitivas corregidas.

## Reproducir las pruebas

Desde la carpeta `IRTRA`:

```powershell
npm ci
npm run qa:setup
npm run qa:test
npm run qa:build
```

En otra terminal, mantenga el servidor abierto:

```powershell
npm run qa:serve
```

Después, ejecute las suites de navegador por separado:

```powershell
npm run qa:cypress
npm run qa:playwright
npm run qa:queue
npm run qa:load
```

Cypress limpia su base dedicada antes de cada escenario y usa `testIsolation: true`; los escenarios crean sus propios datos. No ejecute simultáneamente suites que modifican esta misma base. Al terminar las pruebas de navegador, `npm run qa:demo` vuelve a crear los ejemplos y reinicia el MFA del administrador de demostración para permitir registrar un autenticador propio.

PostgreSQL utiliza el puerto `55434`, la base `irtra_qa`, un rol de aplicación sin privilegios administrativos y un directorio local `.qa/postgres`. El bootstrap usa PostgreSQL 18 instalado en esta computadora. Otra instalación puede indicar `QA_PG_BIN`. La configuración privada está en `.env.qa.local` y los originales sintéticos en `.qa/uploads`; ambas rutas están excluidas de Git.

## Arranque de la presentación

```powershell
powershell -ExecutionPolicy Bypass -File .\INICIAR_PRESENTACION.ps1
```

Abra **https://localhost:3444**. El certificado es local y autofirmado. Las credenciales están en **`.qa/ACCESO_LOCAL.txt`**; no incluya ese archivo en entregas ni capturas. El primer acceso permite registrar su propio autenticador MFA y guardar los códigos de recuperación. El script detecta un servidor ya disponible.

Hay tres boletas llamadas `DEMO-SINTETICA-*`: una queja confirmada, una sugerencia pendiente y una felicitación confirmada. Sus imágenes y transcripciones son ficticias. Su confianza de modelo es cero y se identifica el origen como transcripción controlada. Permiten demostrar revisión del original, edición, confirmación, seguimiento y descarga; no representan análisis real de IA.

Secuencia sugerida: entrar con MFA → mostrar Inicio → abrir la sugerencia pendiente → comparar original y campos editables → guardar una corrección con motivo → confirmar → descargar el informe gerencial → abrirlo en Excel → mostrar auditoría. Las capturas sin datos personales reales están en `evidencias/presentacion-local/`.

**Después de volver a ejecutar Cypress, restaure los ejemplos con `npm run qa:demo`.** Este comando reinicia el MFA de la cuenta de demostración; el siguiente acceso permite registrarlo nuevamente.

## Condiciones para usar datos reales y publicar

La validación local permite presentar los flujos comprobados. La puerta de producción todavía devuelve **`ready: false`**, como consta en `evidencias/PRODUCCION_RESULTADO.json`.

Faltan un ClamAV real actualizado, el alta MFA institucional de las cuentas, dos administradores habilitados para contingencia y la validación del entorno que alojará la aplicación. El anfitrión QA sirve la compilación de producción con datos sintéticos y escaneo por firma; el servidor normal mantiene sus exigencias de seguridad. La configuración original de PostgreSQL apunta al puerto 5434 y no se sustituyó por la base de demostración.

La IA externa permanece deshabilitada en QA. Para medir precisión real hace falta un conjunto de encuestas anonimizadas con transcripciones y categorías revisadas, una configuración autorizada del proveedor y una comparación por campo, categoría y prioridad. Un porcentaje de confianza del modelo no es una tasa de acierto medida. Los documentos ambiguos deben seguir pasando por revisión humana.

Antes de producción también deben comprobarse certificados, TLS de base de datos remota, respaldos y restauración, permisos operativos, monitoreo y aceptación institucional. La auditoría npm cubre avisos conocidos de esas dependencias; no sustituye una evaluación de penetración del despliegue real.

## Referencias consultadas

El aislamiento sigue la [documentación oficial de Cypress](https://docs.cypress.io/app/core-concepts/test-isolation). Las actualizaciones atendieron avisos publicados, entre ellos [Next.js en Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Next.js y SVG](https://github.com/advisories/GHSA-2464-fhr4-w9xw) y [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
