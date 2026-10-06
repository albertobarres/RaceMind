# Inventario inicial de telemetría

Inspección exploratoria de la jerarquía vigente de `Telemetría/`, fuera de este repositorio. Incluye conteos y lectura de muestras, pero no certifica calibración, unidades ni condiciones de uso.

```text
Telemetría/
  Coches/F1/{año}/{Gran Premio}/{sesión}/...
  Motos/{...}
  Simuladores/{simulador}/{dataset o circuito}/...
```

## Conjuntos encontrados

| Fuente | Archivos/tamaño aproximado observado | Formato y granularidad | Señales/metadata observadas | Lectura inicial |
|---|---:|---|---|---|
| F1 / ALO | 40 JSON, ~5 MB | Un `*_tel.json` por vuelta; arrays paralelos bajo `tel` | `time`, `rpm`, `speed`, `gear`, `throttle`, `brake`, `drs`, `distance`, `rel_distance`, `acc_x/y/z`, `x/y/z`, `dataKey`; además `laptimes.json` con tiempos, sectores, compuesto y stint | Candidato recomendado para el primer vertical analítico. `laptimes.json` contiene 39 vueltas; hay 40 archivos y uno presenta solo 3 muestras, por lo que hay que ponerlo en cuarentena y conciliar claves. Las coordenadas X/Y/Z no son GPS confirmado. |
| Assetto Corsa | 1 CSV, ~133 MB; 91.527 filas de datos | Muestras de alta frecuencia | `timestamp`, `wall_time`, `lap_progress`, `completed_laps`, velocidad, RPM, controles, aceleraciones, pose, suspensión, carga, slip y canales de neumáticos | Exportación problemática: valores numéricos en bruto como `865.722.453` y `12.824.029.922.485.300` no se pueden interpretar con seguridad como decimales. En las filas inspeccionadas `completed_laps` y `lap_progress` siguen en cero. No usar hasta recuperar una exportación interpretable y validar segmentación de vueltas. |
| Assetto Corsa Competizione | 1 CSV, ~0,32 MB; 476 filas | Agregados/features por vuelta; 8 valores distintos de `Lap` | Circuito, coche, fecha, identificador de piloto, tiempo de vuelta, estadísticas de velocidad/freno/G/dirección, validez/outlier y `cluster_label` Fast/Medium/Slow | Sirve para explorar features agregadas, no para reconstruir telemetría temporal. No hay ID inequívoco de sesión y no se conoce el origen de las etiquetas de cluster; no usarlas como verdad de terreno ML hasta documentarlas. Algunas features numéricas están exportadas en formato ambiguo. |
| Forza Motorsport | 1 CSV, ~63 MB; 94.519 filas de datos | Muestras temporales con 86 columnas | RPM, ruedas, slip, temperatura, suspensión, pose, aceleración/velocidad, controles, marcha, distancia, tiempos de vuelta y posición de carrera | También hay valores con puntos repetidos dentro de números (`21.785.471`, etc.). `current_lap_time` parece decimal, pero el formato de otras columnas no es seguro. Confirmar exportador/cultura antes de convertir; no aplicar heurísticas de separador decimal. |
| Kawasaki Ninja 400 SSP300 | 85 TXT, ~64 MB; 958.854 líneas | JSON Lines de eventos parciales y dispersos, con streams ECU/IMU | `ts`, señales ECU, acelerador, frenos, velocidad, inclinación, suspensión, combustible; eventos IMU con `t`, `seq`, `ax/ay/az`, `gx/gy/gz` | Buen caso posterior para validar extensibilidad a moto, pero no es todavía una fuente de vueltas lista para el MVP. Los registros actualizan subconjuntos de canales, existen dos relojes y se observan retrocesos de `ts`; faltan segmentación de sesión/vuelta y calibración de sensores. |

## Observaciones transversales

- Conviven datos por muestra, datos agregados por vuelta y metadatos de stint/sesión. No son intercambiables y conviene declarar el nivel de granularidad de cada importación.
- Los formatos miden tiempos con convenciones distintas: tiempo transcurrido de vuelta/sesión, reloj del sistema o marcas del dispositivo. Guardar tiempo transcurrido y tiempo original de la fuente por separado cuando ambos existan.
- Las señales tienen coberturas distintas. Un campo desconocido o no registrado se representará como ausente; no se rellenará con cero.
- Las fuentes de alto volumen aconsejan leer en streaming, validar filas/arrays y conservar un manifiesto de importación en vez de persistir sin filtro el archivo original en Git.
- Las unidades, orientación de ejes, escalas (0–1 frente a 0–100) y semántica de canales necesitan una especificación por adaptador.
- Los tamaños son aproximados, observados en la carpeta local. Algunos CSV presentan una codificación numérica que debe verificarse directamente en el parser; los ejemplos renderizados parecen incluir separadores/precisión inesperados y no se tomarán como valores validados.
- Revisar licencia, procedencia y atribución individualmente. No incorporar los datos completos a un repositorio público.

## Perfilado realizado

### F1 / ALO

- `laptimes.json` tiene 39 entradas para `lap`, `time`, `s1`, `s2`, `s3`, `compound` y `stint`. Existen 40 archivos `*_tel.json`, y uno tiene solo tres puntos; los arrays de este archivo no son válidos como una vuelta completa.
- Los otros ficheros examinados suelen tener aproximadamente 630–675 puntos por vuelta. Por ejemplo, `10_tel.json` tiene 675 puntos, `time` termina en 88,46 s y `distance` en unos 4.636 m. `1_tel.json` tiene 735 puntos y `time` termina en 97,42 s; su `dataKey` indica `2026-Barcelona Grand Prix-Race-ALO-1`, mientras que la lista de tiempos registra 97,171 s. Esta pequeña diferencia requiere verificar la semántica de tiempos y el emparejamiento antes de importar.
- Los tiempos de muestra no son uniformes: para la vuelta 1 la mediana observada de delta temporal ronda 0,13 s, con intervalos individuales variables. Alinear comparaciones por distancia/distancia relativa, no por índice de muestra ni suponiendo frecuencia fija.
- La velocidad máxima en vueltas regulares examinadas ronda 320–350 y es compatible con km/h, pero falta confirmación documental. `distance` termina en alrededor de 4,6 km, compatible con metros. `throttle` va de 0 a 100 mientras `brake` va de 0 a 1: se requieren conversiones separadas por canal/fuente.
- `DriverAhead` es texto y puede ser `None`; no convertirlo a numérico. Los ejes `x/y/z` y aceleraciones necesitan confirmar unidad, orientación y semántica.

### ACC agregado

- Las 476 filas corresponden a Laguna Seca, McLaren 720S GT3 y fecha 20/10/2024. Aparecen ocho números de vuelta y las categorías Fast/Medium/Slow (288/122/66 filas respectivamente).
- `LapTime` se observa aproximadamente entre 86 y 132 s. El encabezado especifica velocidad en km/h y throttle/brake en escala 0–100.
- Todas las filas inspeccionadas tienen `validlap=1` y `outlier=0`; no se explica cómo se generaron `cluster_label` y features derivadas. Varias variables de duración/tiempo contienen números con puntos repetidos. Antes de entrenar, se necesita documentación del pipeline que generó este archivo.

### CSV temporales de simulador

- En Assetto Corsa y Forza, ejemplos del contenido binario/textual incluyen `865.722.453`, `12.824.029.922.485.300` y `21.785.471`. El formato no es parseable con seguridad como decimal estándar. No se debe “arreglar” removiendo puntos ni cambiando separadores sin conocer el proceso de exportación.
- En Assetto Corsa, el muestreo inspeccionado mantiene `completed_laps=0` y `lap_progress=0`, por lo que no se han localizado vueltas en este archivo.
- Forza tiene campos potencialmente útiles para delimitar vuelta (`lap_number`, `current_lap_time`), pero hay que resolver el formato numérico antes de evaluar la señal.

### Kawasaki Ninja 400

- Los 85 logs contienen unas 958.854 líneas. Aproximadamente 894.501 registros contienen `ts` y 64.268 incluyen `seq` de IMU. Muchos eventos son parches: solo contienen los canales que cambiaron o se publicaron en ese instante.
- Los eventos ECU usan `ts` en segundos y los IMU llevan `t` en milisegundos junto con `seq`. Un ejemplo muestra `ts=1.083` y `t=1083`, pero hace falta comprobar offsets y resets entre logs antes de alinear relojes.
- Se observan retrocesos temporales en numerosos archivos y valores iniciales de `lap_time` en cero. Los archivos parecen fragmentos, pero no se encontró todavía una regla fiable que los relacione con sesiones y vueltas.
- Si se reconstruyen canales, conservar eventos originales y mantener estado por stream/log; actualizar solo canales presentes, aplicar caducidad máxima a valores arrastrados y marcar cualquier interpolación/imputación. No fabricar una serie uniforme antes de validar sincronización, calibración y límites de sesión.
- Las escalas/unidades de `ax/ay/az`, `gx/gy/gz` y `bike_lean_angle` no están documentadas en la carpeta.

## Recomendación inicial de análisis y ML

**Fuente inicial:** F1 / ALO por ser acotada, tener telemetría de vuelta de tamaño moderado y una tabla compañera con tiempos/sectores/compuesto/stint. Primero se debe excluir el fichero de tres muestras y conciliar los 40 archivos con las 39 vueltas del resumen.

**Primer vertical determinista:** comparar dos vueltas de la misma sesión, interpolando ambas a posiciones equivalentes de distancia (o distancia relativa) y calcular delta temporal acumulado, velocidades y diferencias de uso de acelerador/freno; resumir por sectores cuando las fronteras estén identificadas. El resultado debe ser reproducible y acompañarse de calidad/unidades de entrada.

**ML:** los 39 registros de vuelta corresponden a un piloto y un evento; no hay etiquetas verificadas de errores de conducción ni volumen suficiente para afirmar generalización. No entrenar todavía. Candidato de investigación para cuando se amplíe el corpus: regresión del delta de tiempo por sector/vuelta a partir de features de telemetría, con partición por eventos/circuitos para evitar fuga y evaluación MAE/RMSE frente a un baseline sencillo. Si no hay target fiable o suficiente variedad, redefinir el caso de ML a partir del nuevo perfilado en lugar de forzarlo.

No elegir ACC como fuente inicial de ML hasta entender su ID de sesión, las etiquetas y el proceso de generación; usar moto como validación de extensibilidad más adelante.

## Nuevas muestras F1 y sesión demo

La carpeta se amplió después con archivos descargados desde [TracingInsights Data Archives](https://tracinginsights.com/data/). Según esa página, los datos se organizan por temporada y se recopilan de fuentes como Ergast y feeds de F1 a través de FastF1. TracingInsights declara que se pueden usar para investigación, análisis académico y proyectos personales; recomienda atribución si se publica el trabajo. Esta descripción no debe transformarse en una afirmación de que RaceMind está afiliado a F1/FIA/equipos ni de que se trata de una fuente oficial única.

- Inventario local: 18 carpetas de Grandes Premios/pruebas, 56.647 archivos JSON y aproximadamente 10,4 GB. Las carpetas `Pre-Season Testing` y `Pre-Season Testing 1` tienen prácticamente el mismo conteo/tamaño, por lo que hay posible duplicación que conviene verificar. No se deben escanear los payloads enteros al iniciar la API ni versionar el dataset completo en Git.
- El número anterior corresponde al inventario anterior a dividir el directorio por tipo de vehículo; el inventario actual se describe por la jerarquía y muestras de la tabla superior. No reutilizar esos conteos como si ya se hubieran recalculado para la nueva estructura.
- Se detectaron 75 carpetas de sesión con `session_laptimes.json` en el primer nivel de cada evento, mostrando que se puede construir un catálogo que enumere sesiones por nombre sin leer los ficheros de telemetría.
- **Sesión elegida para el arranque:** `Barcelona Grand Prix / Race`. Tiene `session_laptimes.json`, `drivers.json`, `weather.json`, `corners.json`, resúmenes por piloto y telemetría por vuelta. VER tiene 66 filas de vuelta y las 66 correspondientes `*_tel.json`; Barcelona Race contiene 22 directorios de pilotos.
- `VER/10_tel.json`: 654 puntos alineados en arrays; `time` 0–84,313 s, `distance` termina en 4.630,53, `rel_distance` ~0–0,996, `speed` 92–334, `throttle` 0–100 y `brake` 0–1. La vuelta 10 del resumen tiene 84,313 s; sectores 24,228 / 34,084 / 26,001; compuesto SOFT; stint 1. Esto confirma la correspondencia para esta vuelta y escalas plausibles (la unidad de `speed` sigue pendiente de validación documental).
- `corners.json` tiene 14 puntos con `CornerNumber`, `X`, `Y`, `Angle` y `Distance`. `weather.json` tiene ocho arrays de longitud 150; sus marcas `wT` avanzan aproximadamente 60 s y contiene variables como `wAT`, `wTT`, `wH`, `wP` y `wWS`. Es contexto de sesión, no una observación por muestra de telemetría.
- `session_laptimes.json` mide ~368 KB y tiene 1.238 elementos por array. Algunos tiempos/sectores son `None` y hay tiempos inusualmente largos; preservar esos nulos y no asumir que cada fila representa una vuelta válida.
- La comparación VER vuelta 10 vs 11 debe producir delta comparada–referencia de −0,136 s (84,177 − 84,313); la API comprobada devuelve ese valor y puede muestrear 51 puntos.

Los tamaños/perfiles corresponden a la copia local en el momento de la inspección. Las condiciones de redistribución/licencia de datos y las del código fuente deben considerarse por separado; la API consume la raíz `Telemetría/` mediante `TelemetryDataRoot`.

## Próximo perfilado reproducible

1. Averiguar el origen/exportador y obtener una exportación de simulador con números inequívocos, o documentación precisa de su serialización.
2. En F1, explicar el archivo con tres muestras y conciliar claves/tiempos entre telemetría y `laptimes.json`.
3. Documentar unidades/escalas y reglas de calidad por canal F1; verificar longitudes de arrays, deltas de tiempo, monotonicidad de distancia y fronteras sectoriales.
4. Para moto, conseguir descripción/calibración de ECU e IMU y la regla que relaciona logs con sesiones/vueltas.
5. Crear un diccionario de datos versionado: campo origen/canónico, unidad, tipo, escala, eje, frecuencia, transformación, nulabilidad y evidencia.
6. Ampliar la muestra F1 a varios eventos, pilotos y circuitos antes de fijar el problema ML y sus particiones de evaluación.
