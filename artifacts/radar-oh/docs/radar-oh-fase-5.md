# RadarOH — Fase 5: plataforma ejecutiva de inteligencia competitiva

## Arquitectura

La Fase 5 mantiene React/Vite, Express, PostgreSQL, Drizzle, OpenAPI y los schedulers existentes. No introduce un segundo almacén, una cola externa ni un servicio de analítica paralelo.

Las métricas se calculan sobre eventos, evidencias, findings y alertas ya persistidos. Las consultas están acotadas por workspace, fechas y límites de filas. El rango analítico máximo es de 366 días.

## Entregables

- Dashboard ejecutivo con seis KPIs: eventos, señales prioritarias, competidores activos, salud de fuentes, relevancia media y alertas pendientes.
- Agrupación de inteligencia por importancia y tipo.
- Comparativa avanzada de competidores.
- Evolución temporal y comparación contra el periodo anterior.
- Radar competitivo calculado con actividad, relevancia e importancia.
- Preferencias de alertas configurables aplicadas a la creación real de alertas.
- Filtros por competidor, fuente, fecha, prioridad, tipo y texto.
- Búsqueda global en competidores, fuentes, eventos e insights.
- Informe ejecutivo generado desde los datos filtrados y exportación CSV.
- Registro de auditoría para mutaciones exitosas y exportaciones.
- Carga diferida de las superficies analíticas para reducir el bundle inicial.

## API

- `GET /api/radar/executive`
- `GET /api/radar/search`
- `GET /api/radar/reports/export`
- `GET /api/radar/alert-preferences`
- `PATCH /api/radar/alert-preferences`

## Persistencia

- `radar_alert_preferences`: activación, importancia mínima, relevancia mínima, confianza mínima y canal interno.
- `radar_activity_log`: acción, entidad, metadatos no sensibles y fecha.

Ambas tablas tienen RLS habilitado y forzado. Las consultas siguen utilizando `current_setting('app.workspace_id', true)` dentro de transacciones y el cliente no puede seleccionar otro workspace.

## Seguridad y rendimiento

- Entradas validadas mediante OpenAPI/Zod.
- Búsquedas limitadas a 160 caracteres y 50 resultados.
- Consultas históricas limitadas a un año y 5.000 eventos.
- Exportación CSV con escape de celdas.
- El log de auditoría no persiste cuerpos de petición.
- Sin credenciales, secretos ni URLs internas expuestas al cliente.
- Superficies con Recharts cargadas mediante `React.lazy`.

## Verificación

La entrega se valida con typecheck, builds, pruebas de contrato HTTP, RLS, escáneres de seguridad y una pasada end-to-end del dashboard, filtros, búsqueda, configuración y exportación.