# RadarOH — Fase 4: inteligencia artificial basada en evidencias

## Alcance

La Fase 4 añade análisis asistido por OpenAI sobre las evidencias que RadarOH ya ha persistido. El modelo no obtiene acceso a internet, conectores ni fuentes externas: recibe únicamente eventos y evidencias normalizadas de PostgreSQL.

## Flujo

1. El scheduler de monitorización persiste evidencias y eventos.
2. El scheduler de IA busca cada cinco minutos eventos todavía no analizados.
3. También se puede ejecutar un análisis manual desde **Insights IA**.
4. El API envía un lote limitado de evidencias al modelo gestionado `gpt-5.6-terra`.
5. La respuesta JSON se valida estrictamente con Zod.
6. Se descartan hallazgos o tendencias que citen IDs ajenos al lote recibido.
7. El análisis, los findings y las alertas se guardan con historial y RLS.

## Controles de fiabilidad

- Sin acceso directo del modelo a fuentes externas.
- Máximo de 50 eventos por análisis.
- Reintentos con backoff y registro estructurado de errores.
- Cada finding conserva `change_event_id` y `evidence_ids`.
- Relevancia y confianza se expresan de 0 a 100.
- Las alertas solo se crean para findings altos o críticos con relevancia mínima de 70 y confianza mínima de 60.
- Las propuestas de actualización de competidores se guardan como propuestas verificables; no modifican fichas automáticamente.
- Las respuestas vacías, JSON inválido, campos fuera de esquema o referencias de evidencia desconocidas no se aceptan como resultados válidos.

## Persistencia

- `radar_ai_analyses`: ejecución, modelo, estado, resumen, tendencias, conteos y errores.
- `radar_ai_findings`: clasificación, importancia, relevancia, confianza, oportunidad, riesgo, tendencia y trazabilidad.
- `radar_ai_alerts`: alertas internas y estado leído/no leído.

Las tres tablas tienen RLS habilitado y forzado mediante `app.workspace_id`.

## API

- `GET /api/radar/ai/status`
- `POST /api/radar/ai/analyze`
- `GET /api/radar/ai/analyses`
- `GET /api/radar/ai/alerts`
- `PATCH /api/radar/ai/alerts/{id}`

## Interfaz

- **Insights IA**: último análisis, resumen, findings, oportunidades, riesgos, tendencias, relevancia, confianza y evidencias.
- **Alertas**: alertas internas con lectura/no lectura.
- **Historial IA**: ejecuciones correctas, en curso o fallidas, con sus errores.

## Verificación

La prueba funcional creó una fuente temporal pública, persistió 50 evidencias y 50 cambios, analizó dos eventos con el modelo gestionado y verificó que todos los findings conservaran IDs de evidencia válidos. La fuente y el análisis temporales se eliminaron al finalizar.

No se inicia la Fase 5 sin aprobación explícita.