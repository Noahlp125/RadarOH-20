# RadarOH — Fase 2: persistencia centralizada y migración segura

## Alcance

Esta fase incorpora la persistencia PostgreSQL para el workspace de OH Casas,
manteniendo el JSON legado como fuente importable y conservando el comportamiento
actual de RadarOH. No incluye monitorización automática, scraping ni IA.

## Base de datos

Se utiliza la base PostgreSQL gestionada ya provisionada en Replit. No se añadió
una conexión Supabase externa porque no existía una conexión autorizada y el
proyecto ya disponía de PostgreSQL, Drizzle y `DATABASE_URL` gestionados.

Tablas creadas:

- `radar_workspaces`
- `radar_imports`
- `radar_sources`
- `radar_competitors`
- `radar_keywords`
- `radar_plan_items`

Las tablas de dominio guardan los valores normalizados y, además:

- `legacy_id`: identificador estable del JSON original.
- `raw_record`: objeto completo del registro recibido, incluidos campos futuros
  que todavía no tengan una columna normalizada.

`radar_imports` conserva el payload completo recibido, el nombre de archivo, la
fecha de exportación, un checksum SHA-256, los recuentos y el resultado de
validación. El archivo original de `attached_assets` no se modifica.

## Seguridad

- `RADAR_WORKSPACE_ID` se configura como variable de entorno no secreta.
- `DATABASE_URL` sigue siendo gestionada por Replit y no se expone al cliente.
- Las entradas y respuestas del API se validan con los esquemas generados desde
  OpenAPI y con validación de dominio Zod.
- Las operaciones de dominio se ejecutan en transacciones.
- Todas las tablas RadarOH tienen RLS, políticas por workspace y `FORCE ROW LEVEL
  SECURITY`.
- El API fija `app.workspace_id` con `set_config(..., true)` dentro de cada
  transacción; el navegador no puede elegir el workspace.
- El límite de cuerpos JSON del API es 1 MB.

La autenticación de usuario y el aislamiento por identidad se implementarán en
la fase de seguridad/autenticación correspondiente. En esta fase existe un
workspace operativo único (`oh-casas`).

## API

Contrato definido en `lib/api-spec/openapi.yaml` y generado con Orval:

- `GET /api/radar/state`
- `PUT /api/radar/state`
- `POST /api/radar/import`
- CRUD de `/api/radar/sources`
- CRUD de `/api/radar/competitors`
- CRUD de `/api/radar/keywords`

La aplicación carga el estado remoto al iniciar y sincroniza los cambios con
debounce. Si una sesión antigua solo tiene `localStorage`, se importa una vez
mediante el endpoint de migración. Si PostgreSQL no está disponible, la interfaz
mantiene el modo local con un aviso visible, sin ocultar el problema.

## Migración ejecutada

Archivo preservado:

`.conversation/attached_assets/radar-oh-datos-2026-09-01_1788292666240.json`

Resultado:

- 10 fuentes.
- 14 competidores.
- 15 keywords.
- 8 tareas del plan 30-60-90.
- 1 snapshot raw registrado en `radar_imports`.

La utilidad reproducible es:

```bash
pnpm --filter @workspace/scripts run migrate:radar
```

Admite `RADAR_IMPORT_FILE` para otra copia JSON y `RADAR_API_URL` para otro
endpoint compatible. Nunca escribe sobre el archivo de entrada.

## Verificación realizada

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm run typecheck`
- `pnpm --filter @workspace/db run push`
- `GET /api/healthz` respondió 200.
- `GET /api/radar/state` respondió el workspace vacío antes de migrar.
- `POST /api/radar/import` respondió 201 con los recuentos anteriores.
- Las tablas, índices, políticas y RLS se comprobaron desde PostgreSQL.

## Estado de cierre

RadarOH funciona con la nueva persistencia, mantiene la exportación/importación
JSON y conserva el respaldo local explícito. La siguiente fase requiere
aprobación expresa; no se ha iniciado monitorización, scraping ni IA.