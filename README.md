# RaceMind

**RaceMind** es un proyecto de TFM para investigar y construir una plataforma de análisis de telemetría de motorsport. Su objetivo es transformar datos de distintas fuentes en métricas comparables, identificar oportunidades de mejora y explicar los resultados.

El proyecto se plantea independiente del formato y del tipo de vehículo. Los datos de F1, simuladores y motocicletas disponibles en la carpeta de trabajo sirven para estudiar y validar el modelo; no definen por sí solos el alcance final.

## Enfoque

```text
Fuente de telemetría → adaptador y normalización → análisis → Machine Learning → informe explicativo
```

Los cálculos y hallazgos deben ser reproducibles. La IA generativa, si se incorpora al MVP, explicará resultados estructurados en lugar de recibir telemetría bruta para hacer cálculos.

## Estado actual

La base inicial está creada: API ASP.NET Core en .NET 10 y dashboard React/TypeScript. La barra lateral permite navegar por `Coches → F1 → año → evento → sesión`, `Motos → MotoGP/WorldSBK → datasets` y `Simuladores → fuente → datasets`. Por ahora, el análisis de vueltas está implementado para F1; las otras fuentes aparecen en el catálogo como base para añadir adaptadores futuros.

## Estructura

```text
docs/
  data/                 Inventario y observaciones de datasets
  architecture/         Modelo de datos y decisiones de diseño
  decisions/            Decisiones arquitectónicas (ADR)
src/
  RaceMind.Api/         API REST y composición de servicios
  RaceMind.Application/ Casos de uso y contratos
  RaceMind.Domain/      Modelo de telemetría y resultados analíticos
  RaceMind.Infrastructure/ Adaptador JSON de TracingInsights
tests/
  RaceMind.UnitTests/   Pruebas del análisis determinista
data/
  samples/               Solo muestras pequeñas, autorizadas y anonimizadas
```

## Datos

Los ficheros completos de telemetría no se versionan en este repositorio. Consulta [`docs/data/telemetry-inventory.md`](docs/data/telemetry-inventory.md) para conocer los conjuntos inspeccionados y las precauciones de interpretación. Las muestras que se incorporen al repositorio deberán ser pequeñas y contar con licencia/atribución verificadas.

## Tecnologías consideradas

- Backend: C#, .NET y ASP.NET Core.
- Persistencia candidata: PostgreSQL y Entity Framework Core.
- Análisis y ML: por decidir tras el perfilado; Python es una opción para experimentación.
- UI: React + TypeScript (dashboard inicial en `web/`; Blazor queda como alternativa si el alcance cambia).
- Infraestructura: Git, GitHub y Docker.

## Ejecutar la API

Requiere .NET 10 SDK. Desde esta carpeta:

```bash
dotnet run --project src/RaceMind.Api --urls http://localhost:5080
```

La API intenta localizar `Telemetría` en una carpeta padre. Si el dataset está en otra ruta, define `TelemetryDataRoot` como variable de entorno/configuración y apunta a la raíz con `Coches`, `Motos` y `Simuladores`. El catálogo agrupa fuentes por categoría y modalidad; las rutas analíticas F1 incluyen el año, por ejemplo `/api/2026/cars/f1/sessions`. Ejemplo PowerShell:

```powershell
$env:TelemetryDataRoot = "C:\ruta\a\Telemetría"
dotnet run --project src/RaceMind.Api --urls http://localhost:5080
```

La API no importa ni copia los 10 GB al repositorio: cataloga nombres de eventos/sesiones desde las carpetas y abre resúmenes y telemetría bajo demanda. La interfaz muestra un mensaje de carga, no selecciona evento ni piloto automáticamente y espera a que el usuario tome esas decisiones. Endpoints y guía de pantallas: [`docs/api-and-frontend.md`](docs/api-and-frontend.md).

## Frontend

Requiere Node.js LTS y npm. En una segunda terminal, desde la raíz del repositorio:

```bash
cd web
npm install
npm run dev
```

Vite sirve el dashboard en `http://localhost:5173` y consume la API en `http://localhost:5080/api`. Se puede cambiar la URL creando `web/.env.local` a partir de `.env.example`.

Pruebas:

```bash
dotnet test RaceMind.sln
```

## Documentación de partida

- [`docs/project-definition.md`](docs/project-definition.md): resumen del problema, objetivos y MVP según la definición del TFM.
- [`docs/data/telemetry-inventory.md`](docs/data/telemetry-inventory.md): inventario inicial y hallazgos de los datos disponibles.
- [`docs/architecture/data-model.md`](docs/architecture/data-model.md): propuesta inicial de modelo lógico.
- [`docs/api-and-frontend.md`](docs/api-and-frontend.md): contrato inicial REST y navegación propuesta para el dashboard.
- [`docs/decisions/0001-modular-monolith-and-source-adapters.md`](docs/decisions/0001-modular-monolith-and-source-adapters.md): decisiones de arquitectura iniciales.
- [`docs/decisions/0002-initial-dataset-and-ml-scope.md`](docs/decisions/0002-initial-dataset-and-ml-scope.md): alcance inicial de fuente/caso de uso y límites para ML.

## Licencias y atribución

Antes de publicar muestras o redistribuir datos, se comprobarán las condiciones de uso de cada fuente. La licencia del código de RaceMind se decidirá por separado.
