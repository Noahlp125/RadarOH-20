# RadarOH 2.0 — Fase 6: preparación de producción

## Estado

La aplicación queda protegida en código, pero **no debe considerarse cerrada hasta republicar** la versión actual y configurar la lista de usuarios autorizados. La publicación existente anterior a Fase 6 sigue siendo pública.

## Controles implementados

- Clerk gestionado por Replit, con tenants y secretos separados para desarrollo y producción.
- Landing pública sin datos, rutas de acceso en español y aplicación visible solo con sesión.
- Todas las rutas `/api/radar/*` exigen sesión; `/api/healthz` permanece público.
- Producción falla de forma cerrada si `RADAR_AUTHORIZED_USER_IDS` no está configurado.
- Sin CORS abierto; las llamadas web son same-origin y usan cookies de Clerk.
- Helmet, límites de body y rate limiting general/específico para operaciones costosas.
- Middleware global de errores sin trazas internas en respuestas.
- Límites de colecciones, fechas y textos; filtrado de claves de prototipo.
- Auditoría de mutaciones con actor Clerk.
- Rol PostgreSQL `radar_app` sin login ni `BYPASSRLS`; cada transacción reduce privilegios antes de acceder a datos.
- Cola durable PostgreSQL para monitorización e IA, con un job recurrente por fuente y otro para análisis.
- Lease único con heartbeat: aunque arranquen varias instancias, solo una reclama trabajos.
- Los jobs registran `queued`, `running`, `success` o `error`, intentos, propietario, tiempos y último error.
- Parada ordenada de HTTP, worker y pool PostgreSQL.
- Tests automatizados para autorización, límites de entrada y aislamiento RLS.
- Threat model del proyecto en `threat_model.md`.

## Publicación segura

1. Crear las cuentas de producción desde la pantalla de acceso.
2. Copiar sus Clerk User IDs desde el panel **Auth** de Replit.
3. Configurar `RADAR_AUTHORIZED_USER_IDS` como variable de producción separada por comas. No es una contraseña, pero debe administrarse como configuración de producción.
4. Publicar frontend y API juntos.
5. En **Publishing → Adjust settings**, elegir **Reserved VM** para el API. El tipo de despliegue se selecciona manualmente en Publishing; no se configura en `artifact.toml`. Autoscale puede suspender el proceso.
6. Publicar el cambio de esquema mostrado por Replit. Debe añadir `radar_worker_jobs` y `radar_worker_leases`; no requiere renombrar ni borrar tablas existentes.
7. Verificar: healthcheck 200; log `RadarOH worker leadership acquired`; un solo lease no caducado; Radar API anónima 401; usuario no permitido 403; usuario permitido puede leer y mutar; cerrar sesión vuelve a la landing.

## Ejecución continua y exclusión

- El API contiene el worker, pero PostgreSQL contiene su coordinación y estado.
- Cada proceso intenta renovar el mismo lease. Solo su propietario puede reclamar jobs con `FOR UPDATE SKIP LOCKED`.
- La monitorización comprueba fuentes vencidas cada minuto. El job de IA vuelve a estar disponible cada cinco minutos.
- Cada job mantiene un advisory lock PostgreSQL durante todo el trabajo externo. La recuperación solo reencola un job si puede adquirir ese mismo lock, evitando que un ejecutor anterior todavía vivo duplique la ejecución.
- El siguiente vencimiento de cada fuente permanece en `radar_sources.next_run_at`; reiniciar el proceso no pierde la planificación.
- No se debe desplegar un segundo comando de worker: el servicio API en Reserved VM es el único proceso necesario.

Consultas de operación, desde la vista de base de datos:

```sql
select owner_id, heartbeat_at, expires_at
from radar_worker_leases;

select kind, status, attempts, available_at, locked_at, finished_at, error_message
from radar_worker_jobs
order by updated_at desc;
```

Debe haber un único lease por workspace. Un job no debe permanecer `running` sin que avance `locked_at`.

## Backup y recuperación

Replit ofrece restauración point-in-time y backups diarios automáticos para bases de producción. La retención documentada es de 7 días en Core y hasta 28 días en Pro/Enterprise.

Procedimiento:

1. Antes de un cambio de esquema, confirmar un punto de restauración reciente.
2. Ejecutar migraciones primero en desarrollo y validar los tests RLS.
3. Ante corrupción o borrado accidental, detener mutaciones y schedulers.
4. Restaurar producción al instante anterior al incidente desde las herramientas de base de datos de Replit.
5. Validar conteos de fuentes, competidores, evidencias, findings y alertas antes de reabrir acceso.
6. Ejecutar una monitorización manual controlada y comprobar que no duplica evidencias.

### Recuperación del worker

1. Reiniciar la Reserved VM o volver a publicar; no editar manualmente jobs en producción.
2. Esperar hasta 90 segundos para que caduque el lease del proceso anterior.
3. En cada tick, el líder marca como interrumpidas las ejecuciones antiguas y reencola jobs sin heartbeat tras dos minutos, pero solo cuando el advisory lock confirma que el ejecutor anterior terminó.
4. Confirmar en logs `RadarOH worker leadership acquired` y revisar los contadores `recoveredJobs`, `recoveredMonitorRuns` y `recoveredAiAnalyses`.
5. Confirmar que `radar_worker_leases.expires_at` avanza y que los jobs pasan de `queued` a `running` y después a `success` o `error`.
6. Si el lease no avanza, comprobar conexión PostgreSQL y reiniciar una sola vez la Reserved VM. No iniciar una segunda copia manual del worker.
7. Si un job termina en `error`, conservar su registro: monitorización respeta `next_run_at` y la IA vuelve a intentar tras cinco minutos.

## Validación automatizada

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
pnpm run typecheck:libs
pnpm --filter @workspace/radar-oh run typecheck
PORT=19205 BASE_PATH=/ pnpm --filter @workspace/radar-oh run build
pnpm --filter @workspace/db run push
```

## Checklist de salida

- [x] Autenticación server-side.
- [x] Autorización fail-closed configurable.
- [x] RLS efectivo aunque la conexión física sea propietaria.
- [x] CORS, headers, rate limiting y límites de payload.
- [x] Errores seguros y apagado ordenado.
- [x] Threat model y procedimiento de recuperación.
- [x] Cola durable y lease único para monitorización e IA.
- [x] Recuperación automática de jobs y ejecuciones interrumpidas.
- [ ] Configurar IDs de usuarios autorizados de producción.
- [ ] Cambiar API de autoscale a Reserved VM.
- [ ] Republicar para sustituir la versión pública anterior.
- [ ] Ejecutar smoke test autenticado en producción.
- [ ] Confirmar manualmente un punto de restauración de producción.
