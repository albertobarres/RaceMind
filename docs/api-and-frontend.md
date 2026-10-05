# API inicial y guía de interfaz

La primera vertical funcional está pensada como una API REST de lectura sobre los JSON de TracingInsights. Sirve el dataset desde disco a demanda; no lo copia a la solución ni carga todos los ficheros de telemetría en memoria. La persistencia relacional queda para una iteración posterior, después de probar consultas y tamaño de sesión.

## Origen de datos demo

Las muestras locales siguen una estructura de sesión:

```text
Telemetría/F1/
  Barcelona Grand Prix/
    Race/
      session_laptimes.json
      drivers.json
      weather.json
      corners.json
      VER/
        laptimes.json
        1_tel.json ... 66_tel.json
```

La muestra de Barcelona Race tiene metadatos globales, resumen de vueltas por piloto y telemetría por vuelta. El API detecta una sesión cuando encuentra `session_laptimes.json`; cada conductor se identifica por su código de carpeta (VER, NOR, etc.). Los nombres descriptivos se obtienen de `drivers.json` cuando está presente.

Los puntos se sirven con distancia en metros, distancia relativa, tiempo transcurrido en segundos, velocidad tal como la entrega el origen (aparenta km/h en la muestra), acelerador porcentual y freno en fracción. En una respuesta comparada, el freno se presenta también como porcentaje. Esta diferencia se debe documentar en tipos/leyendas del frontend.

## Endpoints

Prefijo: `/api`

| Método y ruta | Uso | Respuesta para UI |
|---|---|---|
| `GET /health` | Estado de API | estado de servicio |
| `GET /sessions` | Descubrir Grandes Premios/sesiones disponibles | IDs/nombres; conteos pueden ser nulos y no requieren parsear los resúmenes de vuelta |
| `GET /sessions/{grandPrix}/{sessionName}` | Cabecera de sesión | pilotos, equipos, color, mejor vuelta, curvas y resumen meteorológico |
| `GET /sessions/{grandPrix}/{sessionName}/corners` | Geometría del trazado | número, distancia y posición X/Y de curvas |
| `GET /sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps` | Elegir vueltas de un piloto | tiempos, sectores, compuesto, stint, disponibilidad de telemetría y PB |
| `GET /sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/{lapNumber}/telemetry` | Cargar muestras bajo demanda | canales de telemetría normalizados a un DTO acotado |
| `GET /sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/compare?referenceLap=10&comparedLap=11&points=201` | Comparar dos vueltas del mismo piloto | deltas total/sector y series alineadas por distancia relativa |

Grand Prix y session name son segmentos URL. Por ejemplo:

```text
GET http://localhost:5080/api/sessions/Barcelona%20Grand%20Prix/Race
GET http://localhost:5080/api/sessions/Barcelona%20Grand%20Prix/Race/drivers/VER/laps
GET http://localhost:5080/api/sessions/Barcelona%20Grand%20Prix/Race/drivers/VER/laps/compare?referenceLap=10&comparedLap=11
```

Errores previstos: `404` para sesión/piloto/vuelta inexistente, `400` para parámetros inválidos y `422` si las vueltas cargan pero no pueden compararse por calidad/orden de muestras. El endpoint de telemetría devuelve `404` si no existe o la vuelta no supera el mínimo de muestras.

## Pantallas frontend sugeridas

### 1. Explorador de sesiones

- Lista/selector de Gran Premio y sesión (Race, Practice, Qualifying, etc.) usando `GET /sessions`; al arrancar no hay evento seleccionado.
- Cards/lista de sesiones con número de pilotos y vueltas como resumen.
- Mostrar un indicador de carga mientras se construye el catálogo; los conteos desconocidos se presentan como `—` en lugar de disparar una carga masiva de telemetría.
- Mostrar estado vacío/errores cuando una carpeta no tenga los ficheros esperados.

### 2. Resumen de sesión

- Tabla de pilotos con nombre, código, equipo/color, vueltas disponibles y mejor tiempo.
- Indicadores de contexto: circuito, sesión, número de curvas y una tarjeta meteorológica.
- Ningún piloto se preselecciona. Elegir explícitamente un piloto abre el análisis de vueltas.

### 3. Comparador de vueltas (pantalla principal MVP)

- Selector de piloto y dos vueltas; sugerir como referencia la vuelta válida más rápida, pero permitir al usuario cambiarla.
- Encabezado con tiempo referencia, tiempo comparado y diferencia total.
- Tabla de sectores y diferencias, respetando valores ausentes (`null`/`None`) en vez de presentarlos como cero.
- Gráficas sincronizadas por distancia relativa: velocidad, acelerador/freno y delta de tiempo acumulado.
- Mapa X/Y del circuito/corners como orientación; dibujar trayectoria completa solo cuando haya coordenadas válidas y documentadas.
- Cursor compartido entre gráficos; tooltips con distancia, tiempo de cada vuelta y diferencia.
- Unidades explícitas en ejes/leyendas: speed según validación del origen, throttle %, brake %.

Esbozo inicial de distribución de la pantalla:

```text
┌──────────────────────────────────────────────────────────────┐
│ RaceMind   Barcelona Grand Prix / Race   VER                 │
├──────────────────────────────────────────────────────────────┤
│ Referencia [Lap 10 ▼]  Comparada [Lap 11 ▼]  −0.136 s       │
├──────────────────────────────────────────────────────────────┤
│ Sector 1     Sector 2     Sector 3       Compuesto / stint   │
│   ...          ...          ...            SOFT / 1           │
├──────────────────────────────────────────────────────────────┤
│ MAPA / CIRCUITO (distancia o sectores)                       │
├──────────────────────────────────────────────────────────────┤
│ SPEED      ───────── curva referencia / comparada             │
│ THROTTLE   ───────── curva referencia / comparada             │
│ BRAKE      ───────── curva referencia / comparada             │
│ TIME DELTA ───────── segundos respecto a distancia relativa    │
├──────────────────────────────────────────────────────────────┤
│ Oportunidades / Race Engineer (fase posterior)                 │
└──────────────────────────────────────────────────────────────┘
```

### 4. Informe del ingeniero (posterior)

Presentar hallazgos calculados y validados, después incorporar ML/LLM. El informe no debería calcular de nuevo la comparación ni atribuir causalidad que los datos no acreditan.

## Contrato para gráfica de comparación

La respuesta de comparación es una serie de puntos uniformes en `relativeDistance` de 0 a 1. Cada punto contiene tiempos, delta temporal, velocidades, acelerador y freno en ambas vueltas. La interpolación es lineal entre muestras vecinas tras ordenar por `rel_distance`; los extremos que no cubre exactamente el rango fuente quedan limitados a la primera/última muestra.

Convención del delta: **comparada menos referencia**. Delta positivo significa que la vuelta comparada va por detrás (más tiempo) o muestra un valor de canal mayor; delta negativo, por delante/menor. Las diferencias de sectores son `null` si uno de los valores de origen falta.

## Ejecución local, CORS y frontend

El backend permite por defecto el origen `http://localhost:5173` (Vite). Puede cambiarse mediante `Frontend:Origin`.

1. Iniciar el backend desde la raíz del repositorio: `dotnet run --project src/RaceMind.Api --urls http://localhost:5080`.
2. Instalar Node.js LTS si no está instalado.
3. En otra terminal ejecutar `cd web`, `npm install` y `npm run dev`.
4. Abrir `http://localhost:5173`.

La UI inicial usa React + TypeScript y gráficos SVG ligeros, sin añadir una dependencia de charting. El selector de evento filtra todos los Grandes Premios disponibles; al abrir uno aparecen sus pilotos, contexto y vueltas. El comparador obtiene del backend 201 puntos interpolados. Se puede apuntar a otra URL de API con `web/.env.local`:

```text
VITE_API_BASE_URL=http://localhost:5080/api
```

## Limitaciones conocidas de esta primera base

- El proveedor lee archivos directamente y no persiste resultados en PostgreSQL todavía.
- La exploración de sesiones escanea solo dos niveles de carpetas; no lee las decenas de miles de archivos de telemetría para listar sesiones.
- Se usan los campos comunes F1; variables como RPM, marcha, DRS, aceleraciones y neumáticos podrán exponerse en iteraciones siguientes.
- Un endpoint por vuelta evita enviar todo un Gran Premio al navegador.
- Filtros de validez/invalidez de vuelta deben concretarse a partir de `status`/otras banderas del dataset; inicialmente se exponen filas tal como aparecen, con `hasTelemetry`.
