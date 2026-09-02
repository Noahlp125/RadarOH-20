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
- Parada ordenada de HTTP, schedulers y pool PostgreSQL.
- Tests automatizados para autorización, límites de entrada y aislamiento RLS.
- Threat model del proyecto en `threat_model.md`.

## Publicación segura

1. Crear las cuentas de producción desde la pantalla de acceso.
2. Copiar sus Clerk User IDs desde el panel **Auth** de Replit.
3. Configurar `RADAR_AUTHORIZED_USER_IDS` como variable de producción separada por comas. No es una contraseña, pero debe administrarse como configuración de producción.
4. Publicar frontend y API juntos.
5. Elegir una modalidad de despliegue persistente (Reserved VM) para el API. Autoscale puede suspender el proceso y no garantiza que los schedulers de uno y cinco minutos se ejecuten continuamente.
6. Verificar: healthcheck 200; Radar API anónima 401; usuario no permitido 403; usuario permitido puede leer y mutar; cerrar sesión vuelve a la landing.

## Backup y recuperación

Replit ofrece restauración point-in-time y backups diarios automáticos para bases de producción. La retención documentada es de 7 días en Core y hasta 28 días en Pro/Enterprise.

Procedimiento:

1. Antes de un cambio de esquema, confirmar un punto de restauración reciente.
2. Ejecutar migraciones primero en desarrollo y validar los tests RLS.
3. Ante corrupción o borrado accidental, detener mutaciones y schedulers.
4. Restaurar producción al instante anterior al incidente desde las herramientas de base de datos de Replit.
5. Validar conteos de fuentes, competidores, evidencias, findings y alertas antes de reabrir acceso.
6. Ejecutar una monitorización manual controlada y comprobar que no duplica evidencias.

## Validación automatizada

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
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
- [ ] Configurar IDs de usuarios autorizados de producción.
- [ ] Cambiar API de autoscale a Reserved VM.
- [ ] Republicar para sustituir la versión pública anterior.
- [ ] Ejecutar smoke test autenticado en producción.
- [ ] Confirmar manualmente un punto de restauración de producción.
