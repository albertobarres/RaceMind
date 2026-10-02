# ADR 0001: Monolito modular y adaptadores por fuente

- Estado: aceptada como dirección inicial, sujeta a revisión al implementar.
- Fecha: 2026-10-02.

## Contexto

RaceMind parte de formatos diferentes (JSON con arrays paralelos, CSV temporal, CSV agregado por vuelta y JSON Lines de registros parciales) y del requisito de no limitar el producto a F1 ni a un proveedor.

## Decisión

- Empezar con una aplicación/solución organizada como monolito modular.
- Delimitar adaptadores de ingesta por esquema/proveedor, que traduzcan al modelo canónico y reporten errores de validación.
- Mantener análisis, ML y generación de explicaciones separados de los detalles de lectura y almacenamiento.
- Añadir un proveedor nuevo cuando exista un caso de uso, no anticipar implementaciones vacías.

## Consecuencias

- Menos operación y despliegue que una arquitectura distribuida, conservando límites para probar cada responsabilidad.
- El contrato interno deberá representar canales opcionales y diferencias de granularidad sin fingir equivalencia entre fuentes.
- Un formato streaming grande requerirá procesamiento por lotes/streaming y diseño físico de almacenamiento basado en mediciones.

## Revisar cuando

El perfilado revele restricciones de volumen/latencia o el proyecto exija escalar componentes de forma independiente.
