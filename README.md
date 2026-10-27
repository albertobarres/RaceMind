# RaceMind

**RaceMind** es un proyecto de TFM para investigar y construir una plataforma de análisis de telemetría de motorsport. Su objetivo es transformar datos de distintas fuentes en métricas comparables, identificar oportunidades de mejora y explicar los resultados.

El proyecto se plantea independiente del formato y del tipo de vehículo. Los datos de F1, simuladores y motocicletas disponibles en la carpeta de trabajo sirven para estudiar y validar el modelo; no definen por sí solos el alcance final.

## Enfoque

```text
Fuente de telemetría → adaptador y normalización → análisis determinista → informe explicativo con IA generativa
```

Los cálculos y hallazgos deben ser reproducibles. La IA generativa explica resultados estructurados y no recibe telemetría bruta para hacer cálculos.

## Estado actual

La base inicial está creada: API ASP.NET Core en .NET 10 y dashboard React/TypeScript. F1 dispone de comparación de telemetría; MotoGP dispone de calendario, resultados y tabla de análisis de vueltas desde XLSX. Assetto Corsa ofrece análisis de telemetría CSV por sesión. La navegación ofrece `Coches → F1 → año → evento → sesión`, `Motos → MotoGP → año → evento → sesión` y `Simuladores → fuente → datasets`.

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
- Análisis: métricas y comparaciones reproducibles implementadas en el backend.
- IA generativa: explicaciones en lenguaje natural de hallazgos estructurados.
- UI: React + TypeScript (dashboard inicial en `web/`; Blazor queda como alternativa si el alcance cambia).
- Infraestructura: Git, GitHub y Docker.

## Ejecutar la API

Requiere .NET 10 SDK. Desde esta carpeta:

```bash
dotnet run --project src/RaceMind.Api --urls http://localhost:5171
```

La API intenta localizar `Telemetría` en una carpeta padre. Si el dataset está en otra ruta, define `TelemetryDataRoot` como variable de entorno/configuración y apunta a la raíz con `Coches`, `Motos` y `Simuladores`. El catálogo agrupa fuentes por categoría y modalidad; las rutas analíticas F1 incluyen el año, por ejemplo `/api/2026/cars/f1/sessions`. Ejemplo PowerShell:

```powershell
$env:TelemetryDataRoot = "C:\ruta\a\Telemetría"
dotnet run --project src/RaceMind.Api --urls http://localhost:5171
```

La API no importa ni copia los 10 GB al repositorio: cataloga nombres de eventos/sesiones desde las carpetas y abre resúmenes y telemetría bajo demanda. La interfaz muestra un mensaje de carga, no selecciona evento ni piloto automáticamente y espera a que el usuario tome esas decisiones. Endpoints y guía de pantallas: [`docs/api-and-frontend.md`](docs/api-and-frontend.md).

### Explicaciones generativas (opcional)

Race Engineer puede solicitar una explicación en español de sus hallazgos estructurados. La telemetría cruda no se envía al proveedor. La integración usa un endpoint compatible con Chat Completions y se activa configurando estas variables de entorno en el proceso de la API:

```powershell
$env:GenerativeAI__Endpoint = "https://<proveedor>/v1/chat/completions"
$env:GenerativeAI__ApiKey = "<clave-del-proveedor>"
$env:GenerativeAI__Model = "<modelo>"
dotnet run --project src/RaceMind.Api --urls http://localhost:5080
```

La clave se mantiene en el backend; no debe incluirse en el frontend ni versionarse en el repositorio. Sin configuración, los informes deterministas siguen disponibles y el endpoint generativo devuelve `503`.

## Frontend

Requiere Node.js LTS y npm. En una segunda terminal, desde la raíz del repositorio:

```bash
cd web
npm install
npm run dev
```

Vite sirve el dashboard en `http://localhost:5173` y consume la API en `http://localhost:5171/api`. Se puede cambiar la URL creando `web/.env.local` a partir de `.env.example`.

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

## Licencias y atribución

Antes de publicar muestras o redistribuir datos, se comprobarán las condiciones de uso de cada fuente. La licencia del código de RaceMind se decidirá por separado.
