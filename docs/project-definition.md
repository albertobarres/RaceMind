# Definición del proyecto

## Idea

RaceMind es una plataforma de análisis inteligente de telemetría para motorsport. F1, simuladores, coches y motos son posibles fuentes de datos; el sistema no debe quedar acoplado a una competición ni a un proveedor.

## Problema

La telemetría contiene señales útiles sobre el comportamiento del piloto y del vehículo, pero convertir grandes volúmenes de muestras en oportunidades de mejora requiere interpretación especializada. RaceMind busca responder dónde se gana o pierde rendimiento, qué diferencias observables coinciden con esa variación y cómo presentar los hallazgos de forma comprensible.

## Objetivo general

Diseñar e implementar una plataforma que importe y normalice telemetría de motorsport, calcule métricas y compare vueltas, investigue un caso de Machine Learning justificable con los datos y presente los hallazgos mediante una interfaz y, si procede, explicaciones generativas.

## Alcance inicial propuesto

El MVP se delimitará después de estudiar los datos. Como guía, debería cubrir:

1. Importar al menos una fuente real mediante un adaptador.
2. Normalizar la sesión y sus vueltas a un modelo interno.
3. Calcular métricas deterministas y comparar vueltas.
4. Formular y evaluar un primer problema de ML a partir de las variables realmente disponibles.
5. Exponer hallazgos estructurados y, si se confirma su viabilidad, explicarlos mediante IA generativa.
6. Ofrecer una interfaz funcional para consultar el análisis.

Predicción de neumáticos, estrategia de carrera, setup, tiempo real, compatibilidad completa con motos y múltiples proveedores quedan como posibles ampliaciones, no como compromisos del MVP.

## Criterios de diseño

- Adaptadores aislados por formato/fuente; lógica analítica independiente del proveedor.
- Unidades y significado documentados; ausencia de una señal significa `null`, no cero.
- Conservar procedencia y referencias a los registros originales para poder auditar la normalización.
- Separar análisis determinista, inferencia ML e IA generativa.
- Empezar con un monolito modular y añadir componentes según necesidades verificadas.
- Elegir modelos y métricas de evaluación después de perfilar los datos y definir etiquetas viables.

## Pregunta experimental de partida

¿Hasta qué punto las técnicas de Machine Learning pueden identificar patrones de comportamiento asociados a pérdidas de rendimiento a partir de telemetría? La formulación final, las etiquetas y las métricas quedan condicionadas por el análisis empírico de los datasets.

## Requisitos de entrega del TFM

El trabajo debe contemplar código fuente, documentación reproducible, repositorio GitHub, despliegue cuando sea viable, presentación y vídeo demostrativo. Se integrarán estos entregables durante el desarrollo y se comprobarán las pautas oficiales antes de publicar datos o elegir licencia.
