// Base de conocimiento de ATLAS.
// Describe el funcionamiento real del sistema tal como está programado.
// Si cambia una pantalla, botón, regla o mensaje, actualice esta guía en el
// mismo cambio: ATLAS solo sabe lo que está escrito aquí.

export const ATLAS_KNOWLEDGE_VERSION = "2026-10-30";

// Pantalla en la que está el usuario, según la ruta del navegador.
const SCREENS = [
  [/^\/$/, "Inicio · Centro ejecutivo de experiencia"],
  [/^\/revision/, "Revisar pendientes · Bandeja de revisión"],
  [/^\/encuestas\/\d+/, "Detalle de una encuesta"],
  [/^\/encuestas/, "Buscar encuestas · Encuestas procesadas"],
  [/^\/reportes\/ejecutivo/, "Informe ejecutivo de experiencia (versión imprimible)"],
  [/^\/reportes/, "Reportes"],
  [/^\/carga/, "Escanear o cargar encuestas"],
  [/^\/alertas/, "Alertas · Alertas operativas"],
  [/^\/acciones/, "Planes de acción"],
  [/^\/areas/, "Áreas · Áreas y responsables"],
  [/^\/usuarios/, "Usuarios"],
  [/^\/auditoria/, "Auditoría · Registro de auditoría"],
  [/^\/integraciones/, "Integraciones · Informes e integraciones"],
  [/^\/seguridad/, "Mi seguridad · Seguridad de la cuenta"],
];

export function screenName(pathname) {
  const path = String(pathname || "").split("?")[0].slice(0, 200);
  return SCREENS.find(([pattern]) => pattern.test(path))?.[1] || null;
}

export const ATLAS_KNOWLEDGE = `
# GUÍA OFICIAL DE IRTRA ENCUESTAS (fuente de verdad de ATLAS)

## 1. Qué es el sistema
IRTRA ENCUESTAS recibe boletas de encuesta de visitantes de Los Hostales del IRTRA (PDF o imagen), las lee con IA, propone clasificación, prioridad, áreas responsables y calificaciones de servicio, y obliga a que una persona revise y confirme cada encuesta. Después permite dar seguimiento al caso, recuperar al huésped, crear planes de acción, ver indicadores y exportar informes.
Flujo general: 1) "Escanear o cargar" → 2) "Revisar pendientes" (validación humana) → 3) seguimiento del caso y recuperación del huésped → 4) "Planes de acción" → 5) "Inicio", "Reportes" e informes.

## 2. Roles y permisos (solo existen dos roles)
- Administrador: ve y gestiona todas las encuestas y áreas. Es el único que ve los menús "Usuarios", "Auditoría" e "Integraciones"; el único que crea áreas ("Nueva área"), crea usuarios, activa o desactiva cuentas, reinicia MFA, restablece contraseñas, aprueba o rechaza eliminaciones de encuestas, valida el impacto financiero de los planes y programa informes.
- Verificador: solo ve las encuestas de sus "Áreas autorizadas" (las asigna un Administrador) y las que él mismo cargó mientras no tengan área asignada. Puede cargar encuestas, editar datos extraídos, guardar clasificación, confirmar, reabrir, volver a analizar, registrar seguimiento y recuperación, crear y actualizar planes de acción de sus áreas y solicitar (no ejecutar) la eliminación de una encuesta. En "Áreas" puede ver el catálogo, pero no crear áreas.
- El rol del usuario aparece en la barra superior debajo de su nombre ("Administrador" o "Verificador").
- No existen roles separados de Calidad, Auditor, Responsable de área ni Superusuario; si alguien los menciona, explica que en el sistema actual se usan solo Administrador y Verificador.
- Un Verificador que no ve una encuesta normalmente no tiene autorizada el área de esa encuesta: debe pedir a un Administrador que agregue el área en "Usuarios".

## 3. Menú lateral y barra superior
Menú (en este orden): "Inicio", "Revisar pendientes", "Buscar encuestas", "Reportes", "Escanear o cargar", "Alertas" (muestra un contador de alertas no leídas), "Planes de acción", "Áreas", "Usuarios"*, "Auditoría"*, "Integraciones"*, "Mi seguridad". (*solo Administrador)
- El botón de tres rayas (arriba a la izquierda) oculta o muestra el menú; el sistema recuerda la preferencia en ese navegador.
- Barra superior: indicador "Tiempo real conectado" / "Reconectando…", buscador "Buscar encuesta…", botón de tema claro/oscuro (◐ / ☀), botón "i" (abre la "Guía rápida"), nombre y rol del usuario, botón "Soporte ATLAS" y botón "Salir" (cierra la sesión).
- Buscador "Buscar encuesta…": busca por nombre del archivo, por texto del resumen o por el número de caso exacto (ID) y abre "Buscar encuestas" con los resultados. No busca por número de boleta ni por nombre del visitante.
- Tiempo real: cuando alguien carga, confirma, reabre, reanaliza o actualiza una encuesta, plan o recuperación, las pantallas abiertas muestran un aviso y se actualizan solas. Si dice "Reconectando…", se reconecta automáticamente; si persiste, recargar la página (F5).
- El texto "Guardado automático" de la barra superior no significa que los formularios se guarden solos: cada formulario se guarda con su propio botón.

## 4. Acceso, contraseña y MFA
### Iniciar sesión
1. En la pantalla "Bienvenido" escribir "Correo electrónico" y "Contraseña" y pulsar "Continuar".
2. Si es el primer ingreso (o un Administrador reinició el MFA) aparece "Activa el segundo factor". La pantalla NO muestra código QR: muestra una "Clave manual" y, desplegable, una "URI para configuración avanzada".
   - Google Authenticator: "+" → "Ingresar una clave de configuración" → nombre de cuenta libre (p. ej. IRTRA) → pegar la clave manual → tipo "Basada en el tiempo" → "Agregar".
   - Microsoft Authenticator: "+" → "Otra cuenta" → "O escriba el código manualmente" → nombre y clave → "Finalizar".
   - Escribir en "Código MFA" los 6 dígitos que muestra la app y pulsar "Verificar y entrar".
   - Aparece "Guarda tus códigos": son códigos de recuperación de un solo uso que no vuelven a mostrarse. Guardarlos y pulsar "Confirmo que los guardé".
3. En ingresos posteriores aparece "Verificación en dos pasos": escribir el código de 6 dígitos de la app (o un código de recuperación) y pulsar "Verificar y entrar".
- El código MFA NO llega por correo ni por SMS; siempre sale de la aplicación autenticadora del teléfono.
- El código cambia cada 30 segundos y cada código sirve una sola vez. Si falla, esperar el siguiente código. Si sigue fallando, revisar que la hora del teléfono esté en automático.
- El paso del código expira a los 10 minutos ("Desafío expirado."): volver a escribir correo y contraseña.
- Si se perdió el teléfono: usar un código de recuperación. Si tampoco hay códigos, un Administrador debe usar "Reiniciar MFA" en "Usuarios"; luego se registra de nuevo.
### Bloqueos y sesión
- 5 intentos fallidos de contraseña bloquean 15 minutos; 10 intentos bloquean 60 minutos ("Demasiados intentos. Espera unos minutos.").
- Más de 10 códigos MFA erróneos en 10 minutos: "Demasiados intentos. Espera diez minutos."
- La sesión dura 8 horas. Iniciar sesión en otro navegador o equipo cierra la sesión anterior (solo se permite una sesión activa por usuario); por eso puede aparecer de pronto la pantalla de acceso.
- Cambiar la contraseña, que un Administrador desactive la cuenta, reinicie el MFA o restablezca la clave también cierra las sesiones.
### Cambiar contraseña ("Mi seguridad")
1. Menú "Mi seguridad" → sección "Cambiar contraseña".
2. Escribir "Contraseña actual" y "Nueva contraseña" → "Cambiar contraseña".
3. Se cierran todas las sesiones y hay que volver a entrar (con contraseña y código MFA).
- Política: 14 a 128 caracteres con al menos una mayúscula, una minúscula, un número y un símbolo, y distinta de la actual.
- La sección "Segundo factor" muestra "Activo" o "Pendiente".
- Cambio obligatorio: un usuario nuevo (creado con contraseña inicial) o al que un Administrador le hizo "Restablecer clave" es llevado a "Mi seguridad" después de entrar y no puede usar otras pantallas hasta cambiar la contraseña ("Debe cambiar la contraseña inicial.").
- Olvidé mi contraseña: no hay recuperación automática por correo. Un Administrador debe usar "Restablecer clave" en "Usuarios"; el sistema muestra una contraseña temporal una sola vez.

## 5. "Inicio" → "Centro ejecutivo de experiencia"
- Filtros "Mes a consultar" y "Comparar con" (por defecto el mes anterior) → botón "Actualizar tablero". "Informe ejecutivo" abre el informe imprimible del mes elegido en otra pestaña.
- "Datos al …" indica la hora de los datos.
- Indicadores: "Satisfacción general" (promedio de calificaciones, escala 1 a 5), "Tasa de quejas" (encuestas Queja o Mixta entre encuestas del período), "Resolución de casos" (Resuelto o Cerrado entre encuestas del período), "Cumplimiento de SLA" (casos resueltos antes de su fecha límite entre casos resueltos), "Huéspedes recuperados" (gestiones "Recuperado" entre gestiones de recuperación), "Acciones verificadas" (planes "Verificada" entre planes creados en el período) y el ahorro en quetzales (Q) validado.
- Cada indicador muestra ▲/▼ frente al período comparado (pts para satisfacción, pp para porcentajes).
- Secciones: "Alertas predictivas y operativas", "Evolución de experiencia", "Recomendaciones de ATLAS" (con botón "Crear plan de acción" que lleva a "Planes de acción"), "Ranking por sede o servicio", "Áreas que requieren atención", "Servicios peor calificados", "Temas más frecuentes", "Pronóstico histórico" (regresión de los últimos 12 meses; orientativo, no una certeza), "Calidad de la IA" (porcentaje de casos confirmados en los que la clasificación y la prioridad de la IA no se cambiaron) e "Impacto empresarial documentado".
- "Definiciones y metodología de los indicadores" (desplegable al final) explica cada fórmula.
- Un Verificador ve los indicadores solo de sus áreas autorizadas.
- Reglas de las alertas del tablero: tasa de quejas ≥ 30 % (peligro); casos con SLA vencido (peligro); casos que vencen en menos de 4 horas; quejas de los últimos 7 días 25 % mayores que los 7 días previos (y al menos 3); pronóstico de quejas 15 % mayor que el último mes (y al menos 3); planes de acción vencidos; satisfacción menor a 4/5.

## 6. "Escanear o cargar" (subir encuestas)
1. Menú "Escanear o cargar".
2. En "Selecciona tus documentos" elegir uno o varios archivos PDF, JPG, JPEG o PNG (máximo 50 MB cada uno).
3. Pulsar "Procesar encuestas" y mantener la pantalla abierta. La barra muestra "Validando documentos", "Enviando documentos de forma segura", "El sistema está leyendo y analizando la encuesta" y "Procesamiento completado".
4. Resultado: "N documento(s) recibido(s)". Las encuestas recibidas quedan en "Revisar pendientes".
- Importación automática: si el indicador dice "Importación automática activa", el escáner puede guardar los archivos en la carpeta scanner_inbox del servidor; el sistema los toma solo, archiva los procesados en scanner_inbox/procesados y mueve los inválidos a scanner_inbox/fallidos. Si dice "Importación automática desactivada", solo funciona la carga manual.
- Límite: 20 cargas por minuto por usuario ("Límite de cargas alcanzado. Intente en un minuto.").
- Toda encuesta cargada pasa por revisión humana, aunque la IA tenga alta confianza.
- Si el análisis con IA externa está deshabilitado (modo privacidad/demostración), el documento se recibe sin datos extraídos, con confianza 0 % y la advertencia "El documento no se envió a un proveedor externo; requiere revisión humana.": hay que completar los datos manualmente con "Ver campos editables".
Errores de carga y solución:
- "Formato no permitido." → solo PDF, JPG, JPEG o PNG.
- "El archivo está vacío." / "El archivo supera 50 MB." → volver a escanear; reducir resolución o dividir el PDF.
- "El contenido real no corresponde con la extensión o está corrupto." → el archivo fue renombrado o está dañado; exportarlo de nuevo desde el escáner.
- "El PDF está corrupto o incompleto." → volver a generar el PDF.
- "El PDF contiene acciones activas o archivos incrustados no permitidos." → imprimir/guardar como PDF simple o escanear como imagen.
- "La imagen es ilegible, inválida o demasiado pequeña." → la imagen debe medir al menos 100×100 píxeles; escanear con más resolución.
- "El tipo MIME no corresponde con el archivo." → la extensión no coincide con el tipo real.
- "Imagen no válida: no contiene información de encuestas." → la IA determinó que no es una boleta de encuesta (fotos, facturas, logotipos, páginas en blanco); el documento se descarta.
- "documento duplicado." → ese mismo archivo ya fue cargado antes (se compara el contenido exacto). Si el usuario tiene acceso, aparece "el original existente fue restaurado." y no se crea un caso nuevo.
- Si la IA falla, la encuesta queda en estado "Error" con resumen "Error de análisis…"; abrirla y usar "Volver a analizar" o corregir los datos manualmente.

## 7. "Revisar pendientes" → "Bandeja de revisión"
- Lista todas las encuestas que aún no han sido confirmadas (toda encuesta nueva entra aquí). Columnas: "Caso", "Motivo", "Prioridad", "Confianza", "Acción".
- Orden: primero las de confianza menor a 85 % (de menor a mayor), luego Crítico, luego Alto, luego el resto por antigüedad.
- Motivos: "Confianza menor a 85%", "Caso crítico" o "Confianza o asignación requiere validación".
- Botón "Revisar" abre el detalle de la encuesta. La encuesta sale de la bandeja solo cuando se pulsa "Confirmar encuesta".

## 8. Detalle de una encuesta (arriba dice "Caso #" seguido del número del caso; llámalo “el detalle del caso”)
Se abre desde "Revisar", desde "Buscar encuestas" (clic en el nombre del documento) o desde una alerta. Secciones en orden:
1. "Resumen ejecutivo": resumen, "Tema", "Áreas", "Justificación" de la prioridad, insignias de prioridad, clasificación y confianza, y botón "Documento original" (descarga el archivo).
2. "Validación humana" (formulario de clasificación): "Clasificación", "Prioridad", "Resumen", "Tema principal", "Áreas responsables" (casillas) y "Motivo obligatorio" → botón "Guardar clasificación".
3. "Respaldo del análisis automático": "Confianza estimada del modelo", "Evidencia para la clasificación" y "Campos dudosos o no legibles".
4. "Mesa de revisión" / "Original y campos extraídos": botones "Ver original" (muestra la boleta escaneada) y "Ver campos editables" (formulario digital de la boleta).
5. "Validación humana" (confirmación): estado de validación, cuadro "Motivo de confirmación, reapertura o reanálisis" y botones "Confirmar encuesta", "Reabrir y editar" (solo si ya está "Confirmada") y "Volver a analizar".
6. "Seguimiento del caso": selector de estado, "Sin cambiar responsable"/responsable, comentario → "Registrar seguimiento".
7. "Seguimiento" (historial de comentarios) y "Correcciones" (historial antes → después con autor, fecha y motivo).
8. "Recuperación del huésped" → "Registrar recuperación"; debajo "Historial de recuperación".
9. "Solicitar eliminación".

### 8.1 Corregir los datos leídos por la IA
1. "Ver campos editables".
2. Comparar con "Ver original" y corregir: "No." (número de boleta), 1 Nombre, 2 Afiliado, 3 Fecha, Teléfono, 4 Correo electrónico, 5 Razón de su visita, "Lugar de origen" (Golfito, Gimnasio, Spa, Boliche), Hotel (SAN MARTIN, RANCHERIA, PALAJUNOJ, SANTA CRUZ), Restaurante (KAPAHAPA, AREKAS, LA HACIENDA, COROZOS), Habitación; tabla "6. Califique…" con 14 servicios y opciones Excelente, Bueno, Regular, Malo o "—" (Sin dato); y preguntas 7 a 14.
3. Escribir "Motivo de la corrección" (mínimo 5 caracteres) → "Guardar todos los cambios".
4. Mensaje: "Datos guardados correctamente. La encuesta queda pendiente de confirmación." Cada cambio queda en "Correcciones".
- Guardar datos deja la validación "En revisión": hay que pulsar "Confirmar encuesta" después.
- Los 14 servicios: Cortesía del personal; Prontitud en chequeo de ingreso y salida; Limpieza de habitaciones; Limpieza de sanitarios; Mantenimiento de instalaciones; Jardines; Servicio de maleteros; Calidad de comida; Prontitud en revisión de inventarios; Servicio Club Los Corozos; Servicio en tiendas de conveniencia; Servicio en personal de eventos; Servicio en Restaurante; Personal de seguridad.
- Preguntas: 7 ¿Recomienda visitar Los Hostales?; 8 ¿Tuvo alguna dificultad durante su visita?; 9 ¿Cuál fue?; 10 ¿Le resolvieron el inconveniente a tiempo?; 11 ¿Algún colaborador le causó inconvenientes?; 12 ¿Quién le atendió?; 13 Nombre del colaborador que le atendió; 14 ¿Qué podemos hacer para mejorar su visita?
- Error "Indique un motivo y seleccione opciones válidas." o "Datos de encuesta inválidos." → falta el motivo (≥ 5 caracteres) o hay una opción no válida.

### 8.2 Cambiar clasificación, prioridad o áreas
1. En el formulario "Validación humana" elegir "Clasificación" (Queja, Sugerencia, Felicitación, Mixta, Sin observaciones) y "Prioridad" (Crítico, Alto, Medio, Bajo, Informativo); ajustar "Resumen", "Tema principal" y "Áreas responsables".
2. Escribir "Motivo obligatorio" (≥ 5 caracteres) → "Guardar clasificación".
3. Mensaje: "Clasificación guardada. Confirme la encuesta cuando termine la revisión."
- Efectos: el estado pasa a "Asignado", la validación a "En revisión" y se recalcula el SLA con la nueva prioridad y áreas.
- Un Verificador solo puede marcar áreas que tiene autorizadas ("No puede asignar áreas fuera de su alcance.").
- Criterios: Queja = dificultad, incumplimiento o valoración negativa; Sugerencia = propuesta de mejora sin queja; Felicitación = reconocimiento positivo explícito; Mixta = dos o más de las anteriores con evidencia; Sin observaciones = sin evidencia de ninguna. Prioridad: Crítico = vida, seguridad, delito, acoso/violencia/discriminación grave, emergencia médica, datos personales o daño grave; Alto = queja grave, servicio malo, problema no resuelto o reiterado; Medio = servicio regular o inconformidad concreta; Bajo = mejora menor; Informativo = felicitación o neutral.

### 8.3 Confirmar, reabrir y volver a analizar
- Confirmar: escribir el motivo (≥ 5 caracteres) en el cuadro de "Validación humana" → "Confirmar encuesta" → "Encuesta confirmada.". La validación queda "Confirmada", sale de "Revisar pendientes" y, si el estado era Recibido, En procesamiento o Pendiente de revisión, pasa a "Procesado". La confirmación alimenta el indicador "Calidad de la IA".
- Reabrir: en una encuesta "Confirmada", escribir motivo → "Reabrir y editar" → "Encuesta reabierta para revisión.". Vuelve a "En revisión" y a la bandeja.
- Volver a analizar: escribir motivo → "Volver a analizar" → aceptar el aviso. La IA vuelve a leer el original y REEMPLAZA la lectura automática y las ediciones de esos campos; la encuesta vuelve a "Pendiente de revisión". Si falla: "No fue posible completar el análisis. Los datos anteriores se conservaron.".
- Error "Escriba un motivo de al menos 5 caracteres." → el motivo está vacío o es muy corto.
- "Confianza" es una estimación de legibilidad y evidencia de la IA, no una garantía; menor a 85 % significa revisar con más cuidado.

### 8.4 Seguimiento del caso (estado y responsable)
1. En "Seguimiento del caso" elegir el estado: Recibido, En procesamiento, Procesado, Pendiente de revisión, Asignado, En atención, Resuelto, Cerrado o Error.
2. Opcional: elegir responsable (o dejar "Sin cambiar responsable"). Solo se pueden asignar usuarios activos con acceso a un área de la encuesta (o Administradores); si no: "Responsable fuera del alcance del caso.".
3. Escribir el comentario (obligatorio) → "Registrar seguimiento" → "Seguimiento registrado.".
- No se puede pasar a "Cerrado" un caso de prioridad Crítico ni uno sin confirmar: "Un caso crítico o pendiente de revisión no puede cerrarse." Solución: confirmar la encuesta primero; si es Crítico, usar "Resuelto" (o bajar la prioridad con motivo si la evaluación lo justifica).
- Marcar "Resuelto" o "Cerrado" registra la fecha de resolución, que cuenta para "Resolución" y "Cumplimiento de SLA".

### 8.5 Recuperación del huésped
1. Sección "Recuperación del huésped": "Canal de contacto" (Teléfono, Correo electrónico, Presencial, WhatsApp, Otro), "Estado" (Pendiente, Contactado, Compromiso en seguimiento, Recuperado, No recuperado), "Próximo seguimiento" (fecha y hora, opcional), "Satisfacción posterior (1 a 5)" (opcional, número entero).
2. "Resumen del contacto" (obligatorio), "Respuesta enviada" y "Compromiso adquirido" (opcionales).
3. "Registrar recuperación" → "Gestión de recuperación registrada." Aparece en "Historial de recuperación".
- Solo las gestiones con estado "Recuperado" cuentan como huésped recuperado en el indicador.
- Error "Indique una fecha válida y satisfacción entera entre 1 y 5." → revisar esos dos campos.

### 8.6 Eliminar una encuesta
- Nadie elimina directamente. Cualquier usuario: "Solicitar eliminación" → motivo (≥ 5 caracteres) → "Enviar solicitud". Aparece "Eliminación pendiente de aprobación".
- Solo un Administrador decide: escribe "Motivo de la decisión" y pulsa "Aprobar y eliminar" (definitivo) o "Rechazar solicitud".
- Solo puede haber una solicitud pendiente por encuesta ("Ya existe una solicitud pendiente.").

### 8.7 Documento original
- "Ver original" lo muestra dentro del caso; "Documento original" lo descarga.
- "El archivo original no está disponible. Vuelva a escanearlo para restaurarlo." → cargar de nuevo el mismo archivo en "Escanear o cargar"; el sistema lo reconoce como duplicado y restaura el original sin crear otro caso.
- "El original fue eliminado por la política de retención." → los originales de casos cerrados se eliminan y anonimizan al cumplirse el plazo de conservación (365 días por defecto); no se puede recuperar desde el sistema.

## 9. Estados y SLA
- Estados del caso: Recibido, En procesamiento (la IA está leyendo), Procesado, Pendiente de revisión, Asignado, En atención, Resuelto, Cerrado, Error (falló el análisis).
- Estados de validación: "Pendiente de revisión", "En revisión" (alguien guardó cambios o reabrió) y "Confirmada".
- SLA (tiempo máximo de atención): se calcula desde la hora de carga según la prioridad y el SLA del área asignada más exigente, con máximo de 120 horas. Valores por defecto por área: Crítico 1 h, Alto 4 h, Medio 24 h, Bajo 72 h, Informativo 120 h. Cada área puede tener otros valores (ver "Áreas").
- En "Buscar encuestas", la columna "SLA" muestra la fecha límite, "Vencido" o "Finalizado" (Resuelto, Cerrado o Error).
- El monitor de SLA crea alertas "SLA próximo a vencer" (menos de 4 horas) y "SLA vencido" (y escala el caso) para Administradores y Verificadores del área.

## 10. "Buscar encuestas" → "Encuestas procesadas"
- Filtros: fecha desde, fecha hasta, "Toda área", "Toda prioridad", "Toda clasificación", "Todo servicio", "Todo estado" → "Filtrar". Para quitar filtros, dejar todo en "Toda/Todo" y fechas vacías y pulsar "Filtrar".
- Tabla: "Documento" (clic para abrir el caso), "No. boleta", "Resumen", "Categoría", "Prioridad", "Confianza", "Estado", "SLA", "Validación". Ordenada por prioridad y luego por fecha más reciente.
- "Exportar datos actuales": elegir "Desde" y "Hasta" (por defecto los últimos 30 días) → "Exportar XLSM". Descarga el "INFORME GERENCIAL [desde] a [hasta].xlsm", la plantilla institucional con hojas, gráficos y macros. Al abrirlo en Excel, habilitar macros/contenido si se requiere. Incluye solo encuestas que el usuario puede ver. Si falla: "No fue posible llenar la plantilla gerencial. Verifique Python y openpyxl." (problema del servidor; avisar al administrador técnico).

## 11. "Reportes"
- Filtros "Desde" y "Hasta" → "Actualizar". Sin fechas, muestra desde 2020-01-01 hasta hoy. La pantalla se actualiza sola cada 30 segundos.
- "Descargar Excel": descarga "REPORTE ESTADISTICO [desde] a [hasta].xlsx" con las estadísticas del rango.
- "Informe ejecutivo PDF": abre el informe ejecutivo del rango en otra pestaña; ahí "Imprimir o guardar como PDF" (en el cuadro de impresión elegir "Guardar como PDF") y "Volver a Reportes".
- Contenido: totales (Encuestas, Felicitaciones, Quejas, Sugerencias, Pendientes de revisión, Resueltas o cerradas), gráficos de "Clasificación", "Prioridad", "Estado operativo", "Lugar de origen", "Encuestas por área" (una encuesta puede contar en varias áreas), "Calificaciones por servicio" y la tabla "Encuestas incluidas". Se excluyen solo las encuestas en estado Error.
- Diferencia: "Exportar XLSM" (en Buscar encuestas) = informe gerencial con plantilla institucional y detalle por encuesta; "Descargar Excel" (en Reportes) = resumen estadístico; "Informe ejecutivo" = documento imprimible para dirección.

## 12. "Alertas" → "Alertas operativas"
- Arriba: alertas del período (últimos 30 días) con enlace "Crear plan de acción →".
- Lista de alertas individuales (por ejemplo "SLA vencido", "SLA próximo a vencer"); clic abre el caso. Las no leídas aparecen primero y suman el contador del menú.
- "Marcar todas como leídas" limpia el contador (no resuelve los casos).
- "Sin alertas individuales pendientes" = no hay avisos individuales.

## 13. "Planes de acción"
- Indicadores: "Acciones abiertas" (Pendiente o En ejecución), "Vencidas", "Verificadas" y "Ahorro documentado" (solo ahorro validado financieramente).
- Crear ("Nuevo plan de acción"): "Título" (obligatorio), "Prioridad", "Área responsable", "Responsable", "Fecha límite", "Encuesta relacionada" (o "Acción general"), "Descripción", "Impacto esperado", "Ahorro estimado (Q)" → "Crear plan de acción" → "Plan de acción creado.".
  - El "Área responsable" es obligatoria en la práctica: si se deja "Sin asignar" aparece "Área fuera de su alcance.". Un Verificador solo puede elegir sus áreas.
  - El "Responsable" debe ser un usuario activo autorizado en esa área; si no: "Responsable fuera del área seleccionada.". Si nadie está autorizado en el área, dejar "Sin asignar" o pedir al Administrador que autorice al usuario.
  - "Encuesta fuera de su alcance." → la encuesta elegida no pertenece a sus áreas.
- Actualizar: en la tabla "Seguimiento de acciones", columna "Gestión", abrir "Actualizar" → estado (Pendiente, En ejecución, Verificada, Cerrada), "Evidencia de cumplimiento", "Resultado conseguido" → "Guardar avance" → "Plan actualizado.".
  - Para marcar "Verificada" la evidencia debe tener al menos 5 caracteres ("Agrega evidencia antes de verificar.").
- Solo Administrador: dentro de "Actualizar", "Validación financiera" → estado (Sin validar, Validado, Rechazado, Requiere evidencia), "Ahorro real validado", nota con la fuente → "Validar impacto financiero". Solo lo "Validado" suma al ahorro.
- Desde ATLAS: si el usuario pide expresamente crear un plan, ATLAS muestra una "Propuesta de plan" (título, área, prioridad y plazo) con el botón "Confirmar y crear plan"; no se guarda hasta pulsarlo. El plan queda sin responsable ni encuesta relacionada; se completan después en "Planes de acción".

## 14. "Áreas" → "Áreas y responsables"
- Tabla: "Área", "Responsable" (texto informativo), "Contacto", "SLA" (horas por prioridad) y "Estado" (Activa/Inactiva). Áreas iniciales: Sin especificar, Recepción, Habitaciones, Restaurantes, Seguridad, Mantenimiento, Eventos, Tecnología.
- Solo Administrador: formulario "Nueva área" (a la derecha de la tabla; no es un botón) → "Nombre" (obligatorio), "Descripción", "Responsable", "Correo o contacto", "SLA por prioridad (horas)" (cinco casillas en orden Crítico, Alto, Medio, Bajo, Informativo; valores sugeridos 1, 4, 24, 72, 120) → "Guardar área". Si el nombre existe: "El área ya existe.".
- La IA solo clasifica en áreas activas. La pantalla no tiene opción para editar o desactivar áreas existentes.

## 15. "Usuarios" (solo Administrador)
- Crear: "Nombre completo", "Correo", "Contraseña inicial (14+ caracteres)", rol (Administrador o Verificador), "Áreas autorizadas" → "Crear usuario" → "Usuario creado.".
  - Un Verificador necesita al menos un área ("Un verificador debe tener al menos un área autorizada.").
  - Correo repetido: "El correo ya existe.".
  - El usuario nuevo registrará su MFA en el primer ingreso.
- Tabla: "Usuario", "Rol", "Áreas", "Seguridad" (MFA), "Estado" y acciones de "Seguridad y acceso":
  - "Desactivar"/"Activar": la cuenta no puede/puede ingresar; desactivar cierra sus sesiones. No se puede desactivar al último Administrador activo.
  - "Reiniciar MFA": cierra sus sesiones y deberá registrar MFA de nuevo (usar cuando perdió el teléfono y los códigos).
  - "Restablecer clave": genera una contraseña temporal que se muestra una sola vez; cierra sus sesiones. Comunicarla por un canal seguro.
  - Un Administrador no puede aplicar estas acciones a su propia cuenta ("No puede alterar su propia cuenta desde administración."); para su contraseña usa "Mi seguridad".
- La pantalla no permite editar el nombre, correo, rol ni áreas de un usuario existente.

## 16. "Auditoría" (solo Administrador)
- "Registro de auditoría": últimos 200 eventos con "Fecha", "Usuario" ("Sistema" si fue automático), "Acción" y "Entidad". Es de solo lectura y no se puede modificar ni borrar.
- Acciones frecuentes: LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_VERIFIED, MFA_ENROLLED, MFA_FAILED, PASSWORD_CHANGED, PASSWORD_ADMIN_RESET, MFA_ADMIN_RESET, DOCUMENT_UPLOAD, SCANNER_IMPORT, AI_ANALYSIS, AI_ERROR, INVALID_DOCUMENT_REJECTED, SURVEY_CONFIRM, SURVEY_REOPEN, REPORT_EXPORT, SLA_ESCALATED, NOTIFICATIONS_READ.

## 17. "Integraciones" → "Informes e integraciones" (solo Administrador)
- Estado de canales: "Correo SMTP", "Microsoft Teams", "WhatsApp corporativo" → "Configurado" o "Pendiente de credenciales" (las credenciales las configura el administrador técnico en el servidor, no desde la pantalla).
- "Programar informe ejecutivo": nombre (por defecto "Informe ejecutivo gerencial"), frecuencia (Diario, Semanal, Mensual), hora (zona America/Guatemala), día de la semana (para Semanal) o día del mes (para Mensual), destinatarios (correos corporativos) y "Canales internos" → "Guardar programación".
  - Errores: "Completa nombre, frecuencia y al menos un canal." / "Agrega al menos un correo corporativo válido.".
- "Ejecutar programaciones pendientes ahora" envía de inmediato las que correspondan.
- Tabla "Programaciones" con "Activar"/"Pausar"; "Historial de entregas internas" muestra cada envío y su error.

## 18. Soporte ATLAS
- Botón "Soporte ATLAS" en la barra superior. Enter envía; Shift+Enter hace salto de línea; Esc cierra.
- Límite: 30 preguntas por minuto ("Demasiadas solicitudes seguidas. Espera un minuto.").
- "ATLAS no está configurado." → el asistente de IA está deshabilitado en el servidor; avisar al administrador técnico.
- ATLAS no puede ejecutar acciones en el sistema ni ver encuestas individuales; solo explica y analiza indicadores de los últimos 30 días.

## 19. Problemas frecuentes («lo que dice el usuario» → causa → solución)
- «No me llega el código» → el MFA no se envía por correo; abrir la app autenticadora.
- "Código de verificación incorrecto o ya utilizado." → código vencido, ya usado o reloj del teléfono desfasado; esperar el siguiente código y activar hora automática.
- "Credenciales incorrectas." → correo o contraseña equivocados, o cuenta desactivada; tras 5 intentos se bloquea 15 minutos.
- «Me sacó del sistema» / vuelve a la pantalla de acceso → la sesión venció (8 h), se inició sesión en otro equipo, se cambió la contraseña o un Administrador modificó la cuenta.
- «No veo una encuesta» → no pertenece a sus áreas autorizadas, los filtros la ocultan o fue eliminada; un Administrador puede autorizar el área.
- «No veo el menú Usuarios/Auditoría/Integraciones» → son solo para Administrador.
- «No puedo cerrar el caso» → es Crítico o falta confirmar la encuesta.
- «La encuesta sigue en Revisar pendientes» → falta pulsar "Confirmar encuesta" (guardar cambios no confirma).
- «Los datos de la boleta están mal» → corregir en "Ver campos editables" o usar "Volver a analizar".
- «La IA no leyó nada / confianza 0 %» → análisis externo deshabilitado o falló; completar los datos a mano y confirmar.
- «El tablero no cambia» → revisar el mes elegido y pulsar "Actualizar tablero"; solo cuentan las encuestas del período y de sus áreas.
- «No puedo descargar el Excel» → revisar fechas (formato AAAA-MM-DD; "La fecha final no puede ser anterior a la inicial."); si el error es del servidor, avisar al administrador técnico.
- «No sé cómo empezar» → botón "i" (Guía rápida) o seguir el flujo: Escanear o cargar → Revisar pendientes → Confirmar → Seguimiento.
- "No fue posible conectar con el servicio de autenticación. Verifica que la aplicación y PostgreSQL estén activos." o "El servicio de autenticación no está disponible temporalmente." → el servidor o la base de datos no responde; avisar al administrador técnico.

## 20. Glosario para interpretar preguntas
- subir, escanear, cargar, meter, importar boletas/encuestas/fotos → "Escanear o cargar".
- validar, aprobar, revisar, confirmar, dar por buena la encuesta → "Confirmar encuesta".
- corregir, editar, cambiar datos, arreglar lo que leyó la IA → "Ver campos editables" (datos) o "Guardar clasificación" (categoría/prioridad/áreas).
- tipo, categoría, clasificación → Queja/Sugerencia/Felicitación/Mixta/Sin observaciones.
- urgencia, gravedad, prioridad → Crítico/Alto/Medio/Bajo/Informativo.
- tiempo de respuesta, plazo, vencimiento, SLA → sección 9.
- asignar, responsable, encargado → "Seguimiento del caso" (casos) o "Responsable" (planes de acción).
- contactar, llamar o responder al cliente/huésped/visitante → "Recuperación del huésped".
- reporte, informe, Excel, PDF, exportar, descargar → secciones 10 y 11.
- tablero, dashboard, indicadores, KPI, gráficas, estadísticas → "Inicio" o "Reportes".
- código, segundo factor, 2FA, autenticador, token → MFA (sección 4).
- clave, contraseña, password → sección 4.
- borrar, eliminar, quitar encuesta → sección 8.6.
- notificaciones, avisos → "Alertas".
- permisos, accesos, cuentas, empleados → "Usuarios".
- departamento, sección, área → "Áreas".
- historial, bitácora, quién hizo → "Auditoría" (Administrador) o "Correcciones"/"Seguimiento" dentro del caso.
`.trim();
