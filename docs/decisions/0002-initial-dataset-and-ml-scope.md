# ADR 0002: Dataset inicial y límite de evidencia para ML

- Estado: recomendación aceptada para orientar el MVP, pendiente de confirmar unidades del origen.
- Fecha: 2026-10-02.

## Contexto

El material disponible incluye F1 por vuelta en JSON, dos CSV temporales grandes con codificación numérica ambigua, un CSV ACC agregado por vuelta con etiquetas de procedencia desconocida y logs de moto JSONL con eventos dispersos y límites de sesión/vuelta sin confirmar.

## Decisión

1. Usar F1/ALO como primera fuente para ingesta/análisis después de poner en cuarentena el fichero incompleto y conciliar las vueltas con `laptimes.json`.
2. Implementar primero una comparación determinista de vueltas, alineada por distancia, con deltas de tiempo/canales y resumen por sectores cuando la segmentación esté verificada.
3. No entrenar ML ni comunicar métricas predictivas con las 39 vueltas de un piloto/evento disponibles; no hay etiquetas de error verificadas ni volumen que permita evaluar generalización.
4. Mantener como hipótesis para estudio posterior la regresión del delta de tiempo por sector/vuelta con features de telemetría, condicionada a ampliar el corpus y diseñar particiones sin fuga entre eventos/circuitos.
5. No usar `cluster_label` de ACC como etiqueta supervisada hasta documentar su procedencia y validación.
6. Mantener la moto como prueba posterior de extensibilidad; antes hay que obtener calibración y regla de unión de logs/sesiones/vueltas.

## Consecuencias

- El primer vertical puede validarse sin atribuir a ML resultados que los datos actuales no sostienen.
- Los valores con decimales ambiguos se conservan intactos hasta conocer su serialización; no se aplican heurísticas de reparación.
- Las decisiones definitivas de ML y almacenamiento físico siguen abiertas a evidencia adicional.

## Revisar cuando

- Se confirmen unidades, escalas, tiempos y clave de emparejamiento F1.
- Se amplíe el dataset a varios eventos, pilotos y circuitos.
- Exista target reproducible y baseline, con evaluación agrupada y métricas adecuadas (p. ej. MAE/RMSE para regresión).
