# RaceMind

RaceMind es una aplicación web para explorar y analizar datos de motorsport. Reúne datos de distintas fuentes, calcula comparaciones reproducibles y presenta observaciones en un dashboard. Cuando se configura un proveedor compatible, puede pedir a una IA generativa que explique esos hallazgos; los cálculos no se delegan al modelo.

Este repositorio contiene el código de la API, el dashboard, pruebas y documentación. Los datasets de trabajo viven fuera del repositorio y se conectan mediante `TelemetryDataRoot` o mediante un paquete de demostración.

## Qué incluye

| Fuente | Formato leído | Funcionalidad disponible |
|---|---|---|
| F1 | JSON de TracingInsights | Catálogo de sesiones, pilotos y vueltas; telemetría por vuelta; comparación de dos vueltas alineada por distancia y vistas de hallazgos. |
| MotoGP | Libros XLSX por evento | Calendario, clasificación, evolución de tiempos, análisis de sectores y comparación de registros de vuelta. Son datos agregados, no telemetría continua. |
| Assetto Corsa | `telemetry.csv` y metadata JSON por sesión | Trazada, vueltas reconstruidas, gráficas de velocidad/controles/aceleración, comparación y resumen de neumáticos con avisos de calidad. |
| Karting AiM | CSV con metadata, unidades y marcas de baliza | Trazada GPS, validación de marcadores y calidad, análisis y comparación de vueltas que superan los filtros. |

Las funciones concretas dependen de la fuente y de los campos que contenga cada fichero. MotoGP, por ejemplo, no proporciona aquí muestras continuas; las pantallas no inventan señales que no existen.

## Cómo funciona

```text
Archivos de origen → proveedores/adaptadores → contratos de aplicación
                   → análisis determinista → API REST → dashboard React
                                                      ↘ explicación IA opcional
```

La API lee los ficheros desde disco cuando los necesita; no hay una importación general a una base de datos. En F1 las comparaciones se interpolan sobre una distancia relativa común. El delta de tiempo sigue la convención **vuelta comparada − vuelta de referencia**: positivo significa más tiempo en la comparada. Los informes describen diferencias observadas, no demuestran causalidad. Las explicaciones generativas reciben el resumen/hallazgos estructurados, no los arrays de telemetría originales.

## Estructura del repositorio

```text
src/
  RaceMind.Api/             Endpoints REST, autenticación, configuración y arranque
  RaceMind.Application/     Contratos, servicios de aplicación y comparación de vueltas
  RaceMind.Domain/          Modelo interno de muestras y resultados
  RaceMind.Infrastructure/  Lectores/adaptadores F1, MotoGP, Assetto Corsa y AiM
tests/RaceMind.UnitTests/   Pruebas unitarias de análisis, adaptadores y cuentas
web/                        Dashboard React + TypeScript y proxy de Cloudflare Pages
docs/                       Definición, arquitectura, datos, API e historial de decisiones
scripts/                    Herramientas de empaquetado para la demo multisource
data/samples/               Instrucciones para muestras pequeñas; no contiene datasets
```

## Requisitos

- .NET 10 SDK.
- Node.js LTS y npm.
- Los datos de telemetría correspondientes a las fuentes que se quieran consultar. En desarrollo local pueden estar en una carpeta `Telemetría/` localizada al subir desde el directorio de trabajo, o indicarse explícitamente con `TelemetryDataRoot`.

## Arranque local

La API crea el primer administrador al iniciar. Define credenciales antes del primer arranque; el nombre debe tener 3–32 caracteres permitidos y la contraseña entre 12 y 256 caracteres. Si no existen datos locales, se puede apuntar a la raíz del dataset disponible. En PowerShell, desde la raíz del repositorio:

```powershell
$env:Authentication__Admin__Username = "admin"
$env:Authentication__Admin__Password = "cambia-esto-por-una-clave-larga"
$env:Authentication__Admin__DisplayName = "Administrador"
$env:TelemetryDataRoot = "C:\ruta\a\Telemetría"
dotnet run --project src/RaceMind.Api --urls http://localhost:5171
```

`TelemetryDataRoot` debe apuntar a la carpeta que contiene `Coches`, `Motos`, `Simuladores` y/o `Karting`. Si se omite, la API busca `Telemetría` en la carpeta actual y sus padres y, si no la encuentra, usa `src/RaceMind.Api/data`.

En otra terminal:

```powershell
cd web
npm ci
npm run dev
```

Abre <http://localhost:5173>, inicia sesión con la cuenta configurada y elige una fuente en el panel izquierdo. Vite reenvía `/api` a `http://localhost:5171`; si se desea configurar explícitamente otro destino, copia `web/.env.example` a `web/.env.local` y ajusta `VITE_API_BASE_URL`.

Las rutas de acceso a los datos no seleccionan automáticamente sesión, piloto o vueltas. Health es anónimo; el resto de rutas de análisis requiere iniciar sesión. La primera ejecución escribe `src/RaceMind.Api/data/users.json`, que se ignora en Git. Para cambiar el lugar de almacenamiento, configura `Authentication__UserStorePath`.

## Pruebas y compilación

Desde la raíz:

```powershell
dotnet test RaceMind.sln
```

Para validar también el frontend:

```powershell
cd web
npm ci
npm run build
```

## Configuración opcional

### Explicaciones con IA generativa

El informe determinista funciona sin IA. Para habilitar la explicación y el chat del Race Engineer, configura en el proceso backend un endpoint compatible con Chat Completions, la clave y el modelo:

```powershell
$env:GenerativeAI__Endpoint = "https://proveedor.example/v1/chat/completions"
$env:GenerativeAI__ApiKey = "<clave privada>"
$env:GenerativeAI__Model = "<modelo>"
```

La clave solo reside en el backend. Si faltan estos valores, las solicitudes de explicación responden `503`; no se impide consultar los análisis deterministas.

### Datos de demostración descargables

La API puede descargar al arrancar un ZIP de demostración público por HTTPS (`TelemetryArchive__Url`) o un objeto privado compatible con S3/R2. Actívalo con `TelemetryArchive__DownloadEnabled=true`. La URL debe ser una descarga directa del ZIP, no una página de vista previa. La URL pública tiene prioridad si se configuran a la vez URL y credenciales R2.

El extractor limita tanto el ZIP como su contenido expandido a 512 MiB y valida rutas, `demo-manifest.json`, tamaños y hashes SHA-256. En una descarga habilitada, `TelemetryArchive__RequiredFiles` permite declarar los ficheros que deben existir; si falta alguno, el arranque falla. No se debe incorporar ninguna clave privada al repositorio.

El script `scripts/Export-MultisourceDemo.ps1` construye un paquete con las carreras F1 de Barcelona y Mónaco 2026, los libros MotoGP disponibles de 2026, las sesiones Assetto Corsa fijadas en el script (`Spa-Francorchamps/Corvette C7R` y `Laguna Seca/Audi R8 LMS 2016`) y todos los CSV AiM encontrados en Albaida. Requiere que esas carpetas existan en la raíz de datos; si no, la exportación se detiene. El proveedor de karting excluye del catálogo `Albaida/7.csv` por estar identificado como registro de baja calidad. Por defecto el script escribe en `artifacts/racemind-multisource-expanded-2026.zip`; los artefactos generados están excluidos de Git. Ejemplo:

```powershell
./scripts/Export-MultisourceDemo.ps1 -TelemetryRoot "C:\ruta\a\Telemetría"
```

El manifiesto documenta los ficheros incluidos y sus hashes. Antes de compartir el paquete hay que verificar los derechos y atribuciones de cada conjunto de datos.

## Despliegue

Hay un `Dockerfile` para publicar la API .NET en el puerto `10000`; el contenedor define rutas persistentes para el almacén de usuarios y las claves de Data Protection bajo `/var/data`. El frontend incluye una función de Cloudflare Pages que reenvía `/api/*` a una API remota, configurable con `RENDER_API_URL`. El despliegue necesita almacenamiento persistente para cuentas, claves de cookies y, cuando corresponda, datos descargados. Consulta la guía de [API, autenticación y despliegue](docs/api-and-frontend.md) para las variables y los detalles operativos.

## Documentación

- [Definición, objetivos y alcance implementado](docs/project-definition.md).
- [API, navegación, autenticación, configuración y despliegue](docs/api-and-frontend.md).
- [Modelo de datos lógico y contratos actuales](docs/architecture/data-model.md).
- [Inventario y calidad de los datasets](docs/data/telemetry-inventory.md).
- [ADR 0001: monolito modular y adaptadores](docs/decisions/0001-modular-monolith-and-source-adapters.md).

## Datos y licencias

Los datos originales, derivados y credenciales no deben añadirse al repositorio. La carpeta `data/samples/` explica las condiciones para incorporar muestras pequeñas y reproducibles. Verifica por separado la licencia del código, la procedencia de los datasets y los requisitos de atribución antes de distribuir software o datos. RaceMind es un proyecto independiente y no implica afiliación con campeonatos, federaciones, equipos o proveedores de los datos.
