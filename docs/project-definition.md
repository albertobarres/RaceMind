# Definición del proyecto

## Resumen

RaceMind es una aplicación web de análisis de telemetría y resultados de motorsport. Su objetivo es facilitar la consulta de datos de fuentes heterogéneas, comparar vueltas cuando la granularidad lo permite y presentar observaciones comprensibles, trazables y basadas en evidencias.

## Problema y motivación

Los datos de motorsport combinan señales temporales, resúmenes por vuelta, resultados de sesión y metadatos. Su formato y significado dependen del proveedor. Una comparación útil exige conocer esa granularidad, tratar ausencias como ausencias y alinear las muestras con un criterio explícito. Además, una explicación generada automáticamente no debe convertir correlaciones o diferencias observadas en causas no verificadas.

## Pregunta de investigación

¿Cómo puede una plataforma transformar datos heterogéneos de motorsport en análisis reproducibles y presentar sus hallazgos de forma comprensible y trazable, utilizando IA generativa solo para explicar evidencia estructurada?

## Objetivos

1. Ofrecer un modelo y contratos comunes suficientes para integrar distintas fuentes sin suponer que todas miden lo mismo.
2. Leer datos mediante proveedores específicos, conservando el acceso bajo demanda y sin exigir una base de datos central.
3. Calcular comparaciones reproducibles cuando existen registros con granularidad adecuada.
4. Mostrar resultados, señales, limitaciones y advertencias de calidad en una interfaz web.
5. Permitir explicaciones y preguntas en lenguaje natural a partir de hallazgos calculados, como capacidad opcional.

## Alcance implementado

La solución actual es una aplicación web con API ASP.NET Core en .NET 10 y dashboard React/TypeScript. Incluye:

- **F1:** exploración de sesiones, pilotos, vueltas y muestras JSON de TracingInsights; comparación de dos vueltas del mismo piloto interpoladas por distancia relativa y análisis de sectores.
- **MotoGP:** lectura de hojas de resultados y vueltas en XLSX; clasificación, ritmo por vuelta, sectores y comparación de tiempos agregados. No son muestras continuas de telemetría.
- **Assetto Corsa:** lectura CSV fila a fila, resumen y trazada de sesión, reconstrucción heurística de vueltas y comparaciones visuales de canales.
- **Karting AiM:** lectura de CSV con encabezados, unidades y beacons; validación GPS, segmentación por marcadores, avisos de calidad y comparación de vueltas seleccionadas como comparables.
- **Race Engineer:** hallazgos deterministas en la interfaz y explicación/chat opcionales mediante un proveedor compatible con Chat Completions.
- **Acceso privado:** login con cookies, cuentas gestionadas por un administrador y almacenamiento local de hashes.

La disponibilidad real de cada pantalla depende de que estén presentes los ficheros y canales correspondientes. Se mantiene una navegación común, pero los análisis son específicos de cada fuente.

## Fuera del alcance actual

- Persistencia de sesiones y muestras en PostgreSQL o Entity Framework Core.
- Ingesta general con seguimiento de lotes, reintentos o actualización incremental.
- Telemetría en tiempo real, estrategia de carrera, simulación de setup o predicción de resultados.
- Adaptador analítico para todos los datasets enumerados en el inventario; por ejemplo, Forza y los logs ECU/IMU de Kawasaki no forman parte de las vistas actuales.
- Recuperación/cambio de contraseña desde la interfaz, registro público y un sistema de roles configurable.
- Una licencia de software ya decidida o redistribución general de datos de terceros.

## Criterios de diseño y rigor

- Un adaptador por formato/fuente; la interpretación externa queda fuera de las reglas analíticas comunes.
- Unidades y normalización explícitas; un dato ausente se conserva como `null` o se acompaña de una advertencia, nunca se interpreta automáticamente como cero.
- Comparaciones deterministas, con convención de delta declarada y datos de origen accesibles para auditoría.
- Separación entre cálculo y explicación generativa. El modelo no procesa telemetría cruda ni vuelve a calcular las métricas.
- No se infiere causalidad a partir de diferencias de vuelta. Los filtros y reconstrucciones heurísticos se identifican como tales.
- Empezar como monolito modular y añadir persistencia o servicios distribuidos solo ante necesidades medidas.

## Criterios de evaluación del trabajo

- Una persona puede desplegar la API y el dashboard siguiendo instrucciones reproducibles.
- Las pruebas cubren cálculos, adaptación de formatos y reglas principales.
- Los hallazgos visibles incluyen evidencia, unidades y limitaciones pertinentes.
- La IA puede desactivarse sin perder el análisis determinista.
- El inventario distingue claramente datos perfilados, integraciones efectivamente disponibles y limitaciones de calidad/licencia.

## Entregables del TFM

Código fuente, documentación de uso y arquitectura, repositorio, despliegue cuando sea viable, presentación y vídeo demostrativo. Las pautas oficiales del programa y los derechos de uso de cada dataset se deben comprobar al preparar la entrega pública.
