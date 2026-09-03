# RadarOH: runbook de cutover a Supabase

## Estado y límites

Runbook preparado, **no autorizado para ejecución**. No crear secretos, migrar
datos, cambiar la DB activa ni iniciar el cutover sin aprobación explícita.

Tiempo de mantenimiento propuesto: **90 minutos**, con reserva hasta 120
minutos. Programar cuando no haya monitorizaciones críticas y exista cobertura
de todos los responsables.

## Responsabilidades

| Rol | Responsabilidad |
|---|---|
| Incident/cutover lead | autoriza cada gate, GO y rollback |
| DB operator | backup, freeze verification, schema y migración |
| Application operator | configuración API, smoke tests y observabilidad |
| Worker operator | drain, liderazgo, jobs y reapertura |
| Validator | conteos, RLS, JSON, IDs y evidencia |
| Business owner | acepta ventana, RPO/RTO y punto de no retorno |

Una persona puede cubrir varios roles, pero lead y validator deben confirmar
por separado los gates de datos.

## Gate 0: requisitos previos

- Plan Supabase productivo aprobado.
- PITR/backup y restore drill cumplen RPO ≤15 min / RTO ≤2 h.
- Alertas configuradas y probadas.
- Carga objetivo superada.
- Dos índices validados incluidos en la migración.
- Warning de `public.rls_auto_enable()` resuelto antes de exponer el proyecto.
- Runtime login y Session Pooler probados sin privilegios admin.
- Secretos preparados mediante el flujo seguro, no en chat.
- Harness completo verde en el proyecto definitivo o restore/branch aislado.
- Ventana, responsables y canal de incidente confirmados.

Si falta un requisito: NO-GO.

## Pre-cutover checklist

1. Registrar hora UTC, versiones, proyecto/ref y responsables.
2. Confirmar que Replit PostgreSQL sigue siendo producción.
3. Confirmar que Supabase definitivo está vacío o contiene exactamente la
   rehearsal aprobada; nunca truncar para reutilizarlo.
4. Capturar advisors de seguridad/rendimiento.
5. Confirmar punto de backup/PITR reciente en Replit y Supabase.
6. Confirmar espacio, conexiones y ausencia de incidentes activos.
7. Ejecutar typechecks, tests normales y build.
8. Preparar comandos con nombres de variables, nunca valores en el registro.
9. Confirmar que solo un operador puede habilitar el worker.

## Gate 1: data freeze y drain

1. En Replit producción, aplicar únicamente la configuración aprobada:
   `RADAR_WRITE_FREEZE=true`, `RADAR_WORKER_ENABLED=false`.
2. Reiniciar una vez el runtime.
3. Verificar:
   - mutaciones RadarOH = 503;
   - lecturas = 200;
   - cero monitor runs, análisis o jobs en `running`;
   - lease sin renovación por worker activo;
   - ninguna llamada externa iniciada.
4. Esperar dos minutos para superar lease y stale threshold.

Si aparece una escritura o job activo: detener y extender la ventana.

## Snapshot final

1. Iniciar transacción fuente `REPEATABLE READ READ ONLY`.
2. Exportar JSON y calcular SHA-256.
3. Capturar todos los IDs por tabla, conteos, máximos timestamps y estados.
4. Registrar filas con `legacy_id`, relaciones IA/evidencia y fingerprints.
5. Confirmar backup/punto de restauración.

Desde este punto, mientras siga freeze, rollback a Replit mantiene RPO 0.

## Migración

1. Aplicar migraciones versionadas con conexión owner de Supabase.
2. Ejecutar el migrador con confirmación explícita contra destino vacío.
3. No reutilizar, mergear, truncar ni limpiar automáticamente un destino
   parcial.
4. Conservar Replit PostgreSQL sin modificaciones.
5. Mantener ambos workers desactivados.

## Gate 2: consistencia

Ejecutar el harness completo y verificar:

- conteos fuente/destino;
- UUID y `legacy_id`;
- cero huérfanos FK;
- relaciones IA/evidencia;
- fingerprints;
- RLS y privilegios;
- constraints destructivas dentro de rollback;
- round-trip JSON;
- todos los IDs del snapshot final presentes;
- advisory locks entre dos sesiones;
- cero jobs/análisis inesperadamente nuevos.

Cualquier diferencia no explicada implica rollback antes de switch.

## Switch de aplicación

1. Configurar la API con runtime restringido por Session Pooler.
2. Establecer `RADAR_DATABASE_PROVIDER=supabase`.
3. Establecer `RADAR_WORKSPACE_UUID` y conservar
   `RADAR_WORKSPACE_ID=oh-casas`.
4. Mantener `RADAR_WRITE_FREEZE=true` y `RADAR_WORKER_ENABLED=false`.
5. Reiniciar API una vez.

## Smoke tests congelados

- `/api/healthz` = 200.
- `/api/readyz` = 200.
- `/api/metrics` disponible sin datos sensibles.
- sin sesión = 401 en ruta protegida.
- dashboard, fuentes, competidores, histórico, IA, alertas, plan y búsquedas
  coinciden con el snapshot.
- mutaciones = 503.
- RLS con workspace falso devuelve cero.
- advisors sin findings críticos/altos.

## Gate 3: decisión y punto de no retorno

Opciones:

- **Rollback RPO 0:** antes de aceptar escrituras en Supabase.
- **Commit:** business owner y lead autorizan reabrir escrituras.

Para commit:

1. Establecer `RADAR_WRITE_FREEZE=false`.
2. Mantener worker desactivado y ejecutar una mutación controlada.
3. Validar auditoría y lectura.
4. Establecer `RADAR_WORKER_ENABLED=true` en una sola topología.
5. Confirmar líder, lease, tick y un monitor controlado.

La primera escritura aceptada en Supabase es el punto de no retorno para el
rollback de configuración simple.

## Rollback criteria

Rollback inmediato antes del punto de no retorno si:

- readiness no se mantiene;
- diferencia de conteos/IDs/FKs;
- fallo de RLS o privilegios;
- API JSON incompatible;
- advisory locks o lease no funcionan;
- latencia excede el presupuesto de ventana;
- aparece escritura en la fuente tras snapshot;
- alerta crítica de DB/API/worker.

Después del punto de no retorno, no volver directamente a Replit: requiere
freeze de ambos lados y migración reverse-delta revisada.

## Rollback RPO 0

1. Mantener freeze y ambos workers desactivados.
2. Restaurar `DATABASE_URL` y provider Replit.
3. Retirar `RADAR_WORKSPACE_UUID` del runtime Replit.
4. Reiniciar API una vez.
5. Validar health/readiness, lecturas y IDs.
6. Reabrir escrituras en Replit.
7. Habilitar solo el worker Replit.
8. Conservar Supabase intacto para investigación.

Objetivo: decisión y servicio Replit validado en ≤30 minutos.

## Observación posterior

Durante 24 horas:

- readiness, 5xx y p95;
- conexiones, tamaño, errores y queries lentas;
- líder, lease, ticks, queue depth y oldest job;
- monitor freshness;
- errores/éxitos IA;
- duplicados y crecimiento de evidencias.

No eliminar Replit PostgreSQL hasta una aprobación separada posterior.
