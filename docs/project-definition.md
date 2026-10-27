# Definición del proyecto

## Idea

RaceMind es una plataforma de análisis inteligente de telemetría para motorsport. F1, simuladores, coches y motos son posibles fuentes de datos; el sistema no debe quedar acoplado a una competición ni a un proveedor.

## Problema

La telemetría contiene señales útiles sobre el comportamiento del piloto y del vehículo, pero convertir grandes volúmenes de muestras en oportunidades de mejora requiere interpretación especializada. RaceMind busca responder dónde se gana o pierde rendimiento, qué diferencias observables coinciden con esa variación y cómo presentar los hallazgos de forma comprensible.

## Objetivo general

Diseñar e implementar una plataforma que importe y normalice telemetría de motorsport, calcule métricas reproducibles, compare vueltas y presente los hallazgos mediante una interfaz y explicaciones con IA generativa.

## Alcance inicial propuesto

El MVP se delimitará después de estudiar los datos. Como guía, debería cubrir:

1. Importar al menos una fuente real mediante un adaptador.
2. Normalizar la sesión y sus vueltas a un modelo interno.
3. Calcular métricas deterministas y comparar vueltas.
4. Exponer hallazgos estructurados y ofrecer explicaciones mediante IA generativa, limitadas a las evidencias disponibles.
5. Ofrecer una interfaz funcional para consultar el análisis.

El análisis de neumáticos y estrategia de carrera, el estudio de setup, el tiempo real, la compatibilidad completa con motos y múltiples proveedores quedan como posibles ampliaciones, no como compromisos del MVP.

## Criterios de diseño

- Adaptadores aislados por formato/fuente; lógica analítica independiente del proveedor.
- Unidades y significado documentados; ausencia de una señal significa `null`, no cero.
- Conservar procedencia y referencias a los registros originales para poder auditar la normalización.
- Separar cálculos deterministas y explicación con IA generativa.
- Empezar con un monolito modular y añadir componentes según necesidades verificadas.

## Pregunta de investigación

¿Cómo puede una plataforma transformar telemetría de motorsport en comparaciones reproducibles y utilizar IA generativa para explicar los hallazgos de forma comprensible, trazable y limitada a la evidencia disponible?

## Requisitos de entrega del TFM

El trabajo debe contemplar código fuente, documentación reproducible, repositorio GitHub, despliegue cuando sea viable, presentación y vídeo demostrativo. Se integrarán estos entregables durante el desarrollo y se comprobarán las pautas oficiales antes de publicar datos o elegir licencia.
