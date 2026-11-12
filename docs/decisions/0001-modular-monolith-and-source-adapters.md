# ADR 0001: Monolito modular y adaptadores por fuente

- Estado: aceptada e implementada como arquitectura inicial.
- Decidida: 2026-10-02.
- Revisada: 2026-11-12.

## Contexto

RaceMind integra archivos de formatos y granularidades diferentes: JSON de telemetría por vuelta, CSV temporal, CSV AiM con beacons y libros XLSX de resultados agregados. El producto no debe acoplar la lógica de análisis a una única competición o proveedor.

## Decisión

- Organizar el backend como solución .NET con proyectos de API, aplicación, dominio e infraestructura.
- Mantener en `RaceMind.Infrastructure` proveedores específicos para F1, MotoGP, Assetto Corsa y karting AiM.
- Exponer contratos de aplicación propios de cada fuente donde sus datos/granularidad difieran.
- Mantener los cálculos deterministas y la generación de explicaciones en servicios/responsabilidades separadas.
- Leer archivos bajo demanda; no introducir persistencia o servicios distribuidos hasta que exista una necesidad medida.

## Consecuencias

- El proyecto se ejecuta y opera como una aplicación compacta, con límites de código testeables.
- Se puede sumar una fuente sin convertir todos los esquemas externos a un modelo artificialmente uniforme.
- Los proveedores pueden incluir validación y heurísticas específicas, que deben explicar sus supuestos y advertencias.
- No hay todavía persistencia relacional ni una canalización general de importación; escalar a volúmenes mayores requerirá mediciones y decisiones explícitas.

## Revisar cuando

El tamaño de los datos, los tiempos de respuesta, la concurrencia o los requisitos de operación demuestren que el acceso por archivos o el despliegue único ya no son adecuados.
