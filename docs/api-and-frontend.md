# API, interfaz y operación

Este documento describe los endpoints y las pantallas presentes en el código actual. Todas las rutas de API llevan el prefijo `/api`. Salvo `GET /api/health` y el inicio de sesión, requieren autenticación.

## Flujo de uso

1. Abrir la aplicación y esperar a que la comprobación de salud responda.
2. Iniciar sesión con una cuenta creada por el administrador.
3. Explorar una fuente/categoría en el lateral y seleccionar una sesión o dataset.
4. Consultar el análisis específico de la fuente y elegir las vueltas cuando proceda.
5. Leer los hallazgos deterministas y, opcionalmente, solicitar explicación o hacer una pregunta al Race Engineer.

No se eligen automáticamente una sesión ni un piloto F1. La interfaz mantiene experiencias distintas: F1, MotoGP, Assetto Corsa y karting AiM.

## Endpoints

### Estado y autenticación

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/health` | Anónimo | Comprobación de salud, devuelve `status` y `service`. No verifica que los datos estén completos. |
| `POST /api/auth/login` | Anónimo | Verifica usuario/contraseña y crea cookie de sesión. |
| `GET /api/auth/me` | Autenticado | Devuelve nombre, rol y token CSRF de la sesión. |
| `POST /api/auth/logout` | Autenticado + CSRF | Cierra la sesión. |
| `GET /api/auth/users` | Administrador | Lista las cuentas. |
| `POST /api/auth/users` | Administrador + CSRF | Crea una cuenta estándar. |
| `DELETE /api/auth/users/{id}` | Administrador | Elimina una cuenta. No permite eliminarse a sí mismo ni al último administrador activo. |

Las solicitudes autenticadas `POST` bajo `/api` (salvo login) deben enviar `X-RaceMind-CSRF` con el token devuelto por login o `/auth/me`. El cliente también envía ese encabezado al borrar una cuenta. La cookie se llama `RaceMind.Session`, es `HttpOnly`, expira en ocho horas y tiene expiración deslizante. El login limita a cinco fallos por combinación de IP y usuario durante un minuto.

### Catálogo

| Método y ruta | Función |
|---|---|
| `GET /api/catalog` | Devuelve categorías, series, años, eventos, sesiones y datasets detectados bajo la raíz de datos configurada. |

El catálogo enumera la estructura disponible; no lee todos los JSON de telemetría F1 para construir la navegación. Los detalles de cada sesión se consultan después de seleccionarla.

### F1

| Método y ruta | Función |
|---|---|
| `GET /api/cars/f1/{year}/sessions` | Lista las sesiones F1 detectadas para el año. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}` | Resumen de sesión y pilotos. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}/corners` | Puntos de curva conocidos por la fuente. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}/drivers` | Lista de pilotos. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps` | Resumen de vueltas del piloto. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/{lapNumber}/telemetry` | Telemetría de una vuelta. |
| `GET /api/cars/f1/{year}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/compare?referenceLap=10&comparedLap=11&points=201` | Comparación de dos vueltas del mismo piloto. |

Los segmentos con espacios deben codificarse en URL. Ejemplo:

```text
GET http://localhost:5171/api/cars/f1/2026/sessions/Spanish%20Grand%20Prix/Race/drivers/VER/laps/compare?referenceLap=10&comparedLap=11
```

La comparación interpola por `rel_distance`; el delta siempre es comparada menos referencia. El parámetro opcional `points` acepta de 2 a 2001 puntos y por defecto es 201. En una comparación correcta se devuelven tiempos, deltas por sector (nulos si falta alguno de los tiempos de origen) y las series de velocidad, acelerador y freno.

### MotoGP

| Método y ruta | Función |
|---|---|
| `GET /api/motorcycles/motogp/{year}/events` | Eventos, sesiones y conteos de hojas XLSX. |
| `GET /api/motorcycles/motogp/{year}/events/{eventCode}/sessions/{sessionCode}` | Clasificación y metadata de sesión. |
| `GET /api/motorcycles/motogp/{year}/events/{eventCode}/sessions/{sessionCode}/details` | Alias disponible para los detalles de sesión. |
| `GET /api/motorcycles/motogp/{year}/events/{eventCode}/sessions/{sessionCode}/laps?rider={nombre-o-numero}` | Registros agregados por vuelta; filtro opcional por nombre o dorsal. |

Los tiempos y sectores provienen del workbook; estas hojas no contienen muestras temporales continuas. La UI presenta ritmo por vuelta, sectores, clasificación y comparaciones de registros para el piloto seleccionado, sin inferir trazas de velocidad o frenada.

### Assetto Corsa

| Método y ruta | Función |
|---|---|
| `GET /api/cars/assetto-corsa/sessions/{sessionPath}` | Resumen de sesión, trazada, vueltas detectadas y advertencias. |
| `GET /api/cars/assetto-corsa/sessions/{sessionPath}/laps/compare?referenceLap=1&comparedLap=2&points=201` | Comparación de vueltas reconstruidas. |
| `GET /api/cars/assetto-corsa/sessions/{sessionPath}/assets/{assetName}` | Sirve `map.png` o `car.jpg` si existen. |

La vuelta no se toma de forma garantizada de un marcador del simulador: el adaptador reconstruye cruces cerca del origen de `pos_x/pos_z`. Devuelve advertencias cuando faltan muestras o señales fiables. `sessionPath` es el identificador de dataset (no una ruta arbitraria del sistema de archivos).

### Karting AiM

| Método y ruta | Función |
|---|---|
| `GET /api/karting/sessions` | Datasets CSV de karting disponibles. |
| `GET /api/karting/sessions/{sessionId}` | Metadata, trazada, resumen de segmentos y advertencias de calidad. |
| `GET /api/karting/sessions/{sessionId}/laps/compare?referenceLap=1&comparedLap=2&points=201` | Comparación de dos vueltas clasificadas como comparables. |

El adaptador delimita segmentos a partir de `Beacon Markers`, valida su consistencia y restringe las comparaciones según filtros de tiempo, distancia, velocidad y muestras. Los avisos devueltos forman parte del resultado que debe interpretar el usuario.

### Race Engineer (IA opcional)

| Método y ruta | Función |
|---|---|
| `POST /api/race-engineer/explain` | Solicita una explicación de los hallazgos suministrados. |
| `POST /api/race-engineer/chat` | Pregunta sobre un informe y un historial acotado. |

Estos endpoints requieren autenticación y token CSRF. El informe acepta fuente, vueltas, contexto, de 1 a 8 hallazgos (título, valor y evidencia) y limitaciones. El chat limita la pregunta a 1000 caracteres y el historial a 12 mensajes, de hasta 1000 caracteres cada uno. La llamada al proveedor tiene un timeout de 30 segundos. Sin endpoint, clave o modelo configurados responde `503`; un error del proveedor se traduce a `502`.

La UI calcula primero los hallazgos deterministas. La solicitud generativa contiene contexto resumido y evidencias del informe, no arrays de telemetría originales. Las respuestas son explicativas y deben contrastarse con el origen; no prueban causalidad.

## Códigos de error habituales

- `400 Bad Request`: parámetros o cuerpo inválidos; también falta o no coincide el token CSRF en una escritura autenticada.
- `401 Unauthorized`: falta sesión o las credenciales de login no son válidas.
- `403 Forbidden`: usuario autenticado sin rol administrador para una función de gestión.
- `404 Not Found`: sesión, dataset, piloto, vuelta o recurso inexistente.
- `409 Conflict`: la operación de cuenta dejaría el sistema sin administrador o incumple una condición de integridad.
- `422 Unprocessable Entity`: datos presentes que no superan criterios de lectura/comparación.
- `429 Too Many Requests`: limitador de intentos de login.
- `502 Bad Gateway`: error del proveedor generativo.
- `503 Service Unavailable`: integración generativa sin configurar o API/proxy temporalmente no disponible.

Los formatos de error pueden incluir `{ "message": "..." }`; algunos `404` y errores de autenticación son respuestas vacías.

## Comparación y lectura de gráficas

- El backend produce puntos a distancias relativas uniformes entre 0 y 1, con interpolación lineal entre muestras vecinas.
- El delta temporal es **comparada − referencia**: positivo significa más tiempo transcurrido en la vuelta comparada; negativo, menos.
- En F1 los tiempos/sectores originales se muestran como registros de origen; las señales se interpolan para alinear posiciones equivalentes.
- Canales que no existen en la fuente no deben interpretarse como cero. Los lectores de Assetto Corsa pueden aplicar valores fallback y advertencias; la vista distingue canales constantes/no disponibles cuando los detecta.
- Los hallazgos asociados a curva o punto de frenada son estimaciones derivadas de referencias espaciales/umbrales disponibles, no mediciones causales.

## Configuración de datos

### Raíz de telemetría

Configura `TelemetryDataRoot` (variable de entorno `TelemetryDataRoot`) como ruta a la raíz que contiene las carpetas `Coches`, `Motos`, `Simuladores` o `Karting`. También se acepta el nombre legado `F1DataRoot`. Sin configuración, el backend busca una carpeta `Telemetría` en la carpeta actual y sus padres; como último recurso usa `data` bajo el directorio de la API.

### Archivo de demo en arranque

La API puede descargar un ZIP cuando `TelemetryArchive:DownloadEnabled` sea `true` (`TelemetryArchive__DownloadEnabled=true`). Opciones:

- Descarga HTTPS directa: `TelemetryArchive__Url`.
- R2/S3 compatible: `TelemetryArchive__Endpoint`, `TelemetryArchive__Bucket`, `TelemetryArchive__ObjectKey`, `TelemetryArchive__AccessKeyId` y `TelemetryArchive__SecretAccessKey`.

La URL directa tiene prioridad sobre R2. El endpoint/URL deben usar HTTPS. El ZIP debe contener `demo-manifest.json`, incluir hashes y coincidir con límites de 512 MiB comprimido y expandido. `TelemetryArchive__RequiredFiles__0`, `__1`, etc. permite exigir ficheros concretos. Los valores incluidos en `appsettings.json` comprueban por defecto `Coches/F1/2026/Barcelona Grand Prix/Race/session_laptimes.json` y `drivers.json` cuando se activa una descarga. Si se descarga y falta uno de los requisitos, el arranque falla.

Para generar un ZIP local multisource consulta [`README.md`](../README.md#datos-de-demostración-descargables) y usa `scripts/Export-MultisourceDemo.ps1`.

## Cuentas, cookies y seguridad operativa

En la primera ejecución, la API exige `Authentication:Admin:Username` y `Authentication:Admin:Password` para crear el administrador (`Authentication__Admin__Username`, `Authentication__Admin__Password`). `Authentication:Admin:DisplayName` es opcional; si no se da, se usa el usuario. Las variables solo crean la cuenta si el archivo de usuarios todavía no existe.

El almacén por defecto es `src/RaceMind.Api/data/users.json`, configurable con `Authentication__UserStorePath`. Se guardan hashes de ASP.NET Core Identity, no contraseñas en claro. El fichero está excluido de Git. En producción, debe alojarse en almacenamiento persistente y con acceso restringido. No hay registro público, recuperación ni cambio de contraseña en la UI.

En producción, persiste también las claves de Data Protection para mantener válidas las cookies tras reinicios: configura `DataProtection__KeysPath` (y, opcionalmente, `DataProtection__ApplicationName`). El `Dockerfile` usa `/var/data/users.json` y `/var/data/keys`; el volumen correspondiente debe ser persistente. El proxy de confianza se configura para un salto reenviado, acorde al despliegue actual.

Usa HTTPS en producción. La cookie de producción requiere `Secure` y `SameSite=None`; web y API deben tener un despliegue de dominios que permita las cookies. La configuración CORS admite un origen (`Frontend:Origin`, por defecto `http://localhost:5173`) y credenciales. Para dominios separados, verifica el comportamiento de cookies del navegador y utiliza el proxy web incluido cuando sea posible.

## Ejecución y frontend

Desde la raíz, tras configurar las credenciales y los datos:

```powershell
dotnet run --project src/RaceMind.Api --urls http://localhost:5171
```

En otra terminal:

```powershell
cd web
npm ci
npm run dev
```

Vite escucha en `http://localhost:5173` y reenvía `/api` a `http://localhost:5171`. `VITE_API_BASE_URL` permite cambiar el prefijo/destino que consume el cliente. El login incluye cookies. La aplicación espera el healthcheck antes de consultar la sesión; si el backend está dormido, puede reintentar el arranque durante unos minutos.

### Cloudflare Pages y API remota

`web/functions/api/[[path]].ts` reenvía `/api/*` a la URL de origen configurada en la variable de entorno de Pages `RENDER_API_URL` (por ejemplo, el origen de la API desplegada, sin `/api` al final). También propaga cookies y elimina encabezados hop-by-hop. El cliente puede despertar y consultar el endpoint de salud de la API durante un arranque en frío. La variable `VITE_RENDER_API_URL`, si se necesita ajustar el origen de ese healthcheck directo, tiene por defecto el host público configurado en el frontend.

### Docker

La imagen multi-stage compila con el SDK .NET 10 y ejecuta la API ASP.NET Core en el puerto `10000`. Antes de desplegar:

1. Configura credenciales iniciales de administrador mediante secretos/variables privadas.
2. Define una ubicación persistente para el almacén de usuarios y las claves de Data Protection.
3. Configura `Frontend__Origin` con el origen real de la web.
4. Configura `TelemetryDataRoot` con una carpeta montada o habilita la descarga de archivo.
5. Asegúrate de servir tráfico HTTPS y de que los datos requeridos estén presentes.

## Mapa de la interfaz

- **F1:** resumen de sesión y condiciones; selección explícita de piloto; selectores de vuelta; tiempo y sectores; velocidad, acelerador, freno, delta temporal y observaciones asociadas a curva/distancia.
- **MotoGP:** métricas de sesión, gráfico de tiempos de vuelta para hasta cuatro pilotos, mapa de mejores sectores, comparación de dos vueltas/cuatro sectores, clasificación y tabla de registros.
- **Assetto Corsa:** ficha de sesión/vehículo, mapa de trazada y mapa del circuito de referencia, métricas, advertencias, comparación de vueltas, canales y temperaturas de neumático, tabla por vuelta.
- **Karting:** trazada GPS, métricas, advertencias y filtros de calidad, comparación de vueltas AiM y tabla de segmentos/beacons.
- **Race Engineer:** evidencia determinista, navegación desde un hallazgo a su área en las gráficas, explicación generativa y chat opcionales.

## Limitaciones conocidas

- No se ha implementado persistencia relacional; los ficheros deben estar disponibles localmente o mediante el ZIP de demostración.
- La API lee los formatos esperados por cada proveedor; no es un importador universal para todos los conjuntos mencionados en el inventario. Aunque algunos lectores procesan el archivo fila a fila, las muestras necesarias para una sesión se pueden mantener en memoria y cachearse.
- La reconstrucción de vueltas de Assetto Corsa depende de una heurística geométrica y filtros explícitos.
- Los datos MotoGP disponibles son agregados. No sustentan análisis de canales temporales o ubicación de diferencias en el circuito.
- Los filtros de karting dependen de la metadata y calidad GPS de la exportación AiM.
- No todos los canales son válidos en todas las sesiones. Las advertencias de calidad y las notas de cada vista son parte del análisis.
- La configuración de IA es opcional y depende de disponibilidad, límites y políticas del proveedor externo.
- El almacén de cuentas es un fichero local adecuado a la escala de esta aplicación; para varias réplicas concurrentes haría falta un almacén compartido.
