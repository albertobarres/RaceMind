# Inventario inicial de telemetría

Inspección exploratoria de los ficheros presentes en `Telemetría/`, fuera de este repositorio. El inventario se basa en estructura y muestras; todavía no es un perfil estadístico completo ni certifica todas las unidades o condiciones de uso.

## Conjuntos encontrados

| Fuente | Archivos/tamaño aproximado observado | Formato y granularidad | Señales/metadata observadas | Lectura inicial |
|---|---:|---|---|---|
| F1 / ALO | 40 JSON, ~5 MB | Un fichero `*_tel.json` por vuelta; arrays paralelos bajo `tel` | `time`, `rpm`, `speed`, `gear`, `throttle`, `brake`, `drs`, `distance`, `rel_distance`, `acc_x/y/z`, `x/y/z`, `dataKey`; además `laptimes.json` con tiempos, sectores, compuesto y stint | Candidato claro para un primer adaptador. Validar que todos los arrays por vuelta tienen igual longitud, semántica/unidades de coordenadas, claves entre archivos y reglas de vuelta válida. Las coordenadas X/Y/Z no deben etiquetarse como GPS sin confirmar su referencia. |
| Assetto Corsa | 1 CSV, ~133 MB | Filas de muestras de alta frecuencia | `timestamp`, `wall_time`, `lap_progress`, `completed_laps`, velocidad, RPM, controles, dirección, aceleraciones, pose, suspensión, carga, slip, temperaturas/desgaste y coordenadas de posición | Fuente muy rica para análisis de dinámica y neumáticos. Necesita parser streaming y perfilado de delimitador, cultura decimal, frecuencia y límites de vueltas; no cargar el fichero completo en memoria. |
| Assetto Corsa Competizione | 1 CSV, ~0,32 MB | Una fila por vuelta con agregados/estadísticos y features | Circuito, coche, fecha, número/tiempo de vuelta, estadísticas de velocidad/freno/g lateral y longitudinal/dirección, etiquetas de outlier/validez/cluster, métricas de estilo | Útil para explorar métricas a nivel de vuelta, pero no sustituye muestras temporales: no permite reconstruir gráficas ni localizar con precisión eventos dentro de la vuelta. |
| Forza Motorsport | 1 CSV, ~63 MB | Muestras temporales de una sesión | RPM, velocidades de rueda, slip, temperaturas, suspensión, posición, aceleración/velocidad, controles, marcha, distancia, tiempos de vuelta y posición de carrera | Fuente con canales extensos. Inspeccionar sesión/lap IDs, frecuencia, unidades, campos nulos y dialecto numérico antes de diseñar importación. |
| Kawasaki Ninja 400 SSP300 | 85 TXT, ~64 MB | JSON Lines de registros dispersos/parciales por log | `ts`, canales de ECU, acelerador, freno delantero/trasero, velocidades de vehículo/rueda, ángulo de inclinación, suspensión, combustible; algunos registros IMU con `t`, `seq`, `ax/ay/az`, `gx/gy/gz` | Aporta una comprobación real de extensión a motocicleta. Las líneas suelen ser parches dispersos y existen familias de tiempo/canales distintas; hay que reconstruir estado por canal y alinear IMU/ECU sin inventar muestras. Determinar cómo se identifican sesiones y vueltas. |

## Observaciones transversales

- Conviven datos por muestra, datos agregados por vuelta y metadatos de stint/sesión. No son intercambiables y conviene declarar el nivel de granularidad de cada importación.
- Los formatos miden tiempos con convenciones distintas: tiempo transcurrido de vuelta/sesión, reloj del sistema o marcas del dispositivo. Guardar tiempo transcurrido y tiempo original de la fuente por separado cuando ambos existan.
- Las señales tienen coberturas distintas. Un campo desconocido o no registrado se representará como ausente; no se rellenará con cero.
- Las fuentes de alto volumen aconsejan leer en streaming, validar filas/arrays y conservar un manifiesto de importación en vez de persistir sin filtro el archivo original en Git.
- Las unidades, orientación de ejes, escalas (0–1 frente a 0–100) y semántica de canales necesitan una especificación por adaptador.
- Los tamaños son aproximados, observados en la carpeta local. Algunos CSV presentan una codificación numérica que debe verificarse directamente en el parser; los ejemplos renderizados parecen incluir separadores/precisión inesperados y no se tomarán como valores validados.
- Revisar licencia, procedencia y atribución individualmente. No incorporar los datos completos a un repositorio público.

## Próximo perfilado reproducible

1. Contar sesiones, vueltas, filas y bytes por fuente; registrar hashes y nombres sin copiar datasets.
2. Inspeccionar delimitador, encoding, encabezados, tipos y configuración decimal de cada CSV.
3. Medir frecuencia de muestreo, huecos, duplicados, orden temporal y valores fuera de rango.
4. En F1, comprobar longitudes de arrays, claves de sesión/vuelta, cobertura entre telemetría y `laptimes.json`, y vuelta/sector/compuesto/stint.
5. En moto, contar qué tipos de registros JSONL aparecen, reconstruir señales dispersas en una muestra y averiguar la segmentación de sesiones/vueltas.
6. Crear diccionario de datos por adaptador: nombre original, nombre canónico, unidad, frecuencia, transformación, nulabilidad y calidad.
7. Elegir el primer dataset y el problema ML en función de cobertura, etiquetas y posibilidad de separar entrenamiento/evaluación evitando fuga entre vueltas de la misma sesión.
