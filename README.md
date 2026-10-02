# RaceMind

**RaceMind** es un proyecto de TFM para investigar y construir una plataforma de análisis de telemetría de motorsport. Su objetivo es transformar datos de distintas fuentes en métricas comparables, identificar oportunidades de mejora y explicar los resultados.

El proyecto se plantea independiente del formato y del tipo de vehículo. Los datos de F1, simuladores y motocicletas disponibles en la carpeta de trabajo sirven para estudiar y validar el modelo; no definen por sí solos el alcance final.

## Enfoque

```text
Fuente de telemetría → adaptador y normalización → análisis → Machine Learning → informe explicativo
```

Los cálculos y hallazgos deben ser reproducibles. La IA generativa, si se incorpora al MVP, explicará resultados estructurados en lugar de recibir telemetría bruta para hacer cálculos.

## Estado actual

Fase de estudio de datos y modelado conceptual. Aún no se han fijado el caso definitivo de Machine Learning, el proveedor LLM, el frontend ni la persistencia. Las propuestas iniciales están en [`docs/architecture/data-model.md`](docs/architecture/data-model.md) y se revisarán al implementar los adaptadores y perfilar los datos.

## Estructura

```text
docs/
  data/                 Inventario y observaciones de datasets
  architecture/         Modelo de datos y decisiones de diseño
  decisions/            Decisiones arquitectónicas (ADR)
src/                    Código de la solución (se añadirá tras cerrar el modelo inicial)
tests/                  Pruebas de la solución
data/
  samples/               Solo muestras pequeñas, autorizadas y anonimizadas
```

## Datos

Los ficheros completos de telemetría no se versionan en este repositorio. Consulta [`docs/data/telemetry-inventory.md`](docs/data/telemetry-inventory.md) para conocer los conjuntos inspeccionados y las precauciones de interpretación. Las muestras que se incorporen al repositorio deberán ser pequeñas y contar con licencia/atribución verificadas.

## Tecnologías consideradas

- Backend: C#, .NET y ASP.NET Core.
- Persistencia candidata: PostgreSQL y Entity Framework Core.
- Análisis y ML: por decidir tras el perfilado; Python es una opción para experimentación.
- UI: React/TypeScript o Blazor, pendiente de decisión.
- Infraestructura: Git, GitHub y Docker.

## Desarrollo

La solución ejecutable todavía no está creada. Los siguientes hitos son completar el perfilado de los formatos, acordar unidades y reglas de normalización, validar el modelo conceptual y definir el primer caso de uso vertical. Después se generará la solución .NET y se añadirá configuración de ejecución y pruebas.

## Documentación de partida

- [`docs/project-definition.md`](docs/project-definition.md): resumen del problema, objetivos y MVP según la definición del TFM.
- [`docs/data/telemetry-inventory.md`](docs/data/telemetry-inventory.md): inventario inicial y hallazgos de los datos disponibles.
- [`docs/architecture/data-model.md`](docs/architecture/data-model.md): propuesta inicial de modelo lógico.
- [`docs/decisions/0001-modular-monolith-and-source-adapters.md`](docs/decisions/0001-modular-monolith-and-source-adapters.md): decisiones de arquitectura iniciales.

## Licencias y atribución

Antes de publicar muestras o redistribuir datos, se comprobarán las condiciones de uso de cada fuente. La licencia del código de RaceMind se decidirá por separado.
