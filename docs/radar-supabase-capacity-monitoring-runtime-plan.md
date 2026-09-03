# RadarOH: capacidad, observabilidad y runtime Supabase

## Snapshot y modelo de crecimiento

El rehearsal contiene 38 fuentes, 80 monitor runs, 371 evidencias, 371 change
events, 47 análisis, 2 findings, 1 alerta y 39 worker jobs.

Este es un snapshot de staging. En la lectura final, el origen Replit activo ya
tenía 52 análisis y 58 entradas de actividad, mientras staging conservaba 47 y
55. Runs, evidencias y eventos seguían en 80/371/371. La divergencia es
esperada mientras producción continúa escribiendo y confirma que ninguna
comparación final puede hacerse fuera del freeze.

Los logs del origen muestran que el scheduler IA continúa agotando tres intentos
por referencias de evidencia inválidas. La capa de validación evita persistir
findings no respaldados, pero cada ciclo crea un análisis de error y consume
capacidad/IA. Antes del cutover debe estabilizarse el contrato de salida o
desactivarse explícitamente el job IA hasta resolverlo; no basta con migrar la
base de datos.

Por monitorización satisfactoria:

- 1 fila de run;
- `F` filas de evidencia, aunque el ítem no cambie;
- `C` change events, con `C ≤ F`;
- actualizaciones del run y de la fuente.

Frecuencias actuales: diaria = 1 día, semanal/default = 7 días y mensual = 30
días. El scheduler encola hasta 10 fuentes por tick de 60 segundos. El worker
procesa secuencialmente hasta 10 jobs por tick; latencia de red o IA reduce el
throughput real.

Tamaño observado en staging:

| Tabla | Filas | Tamaño total | Promedio observado |
|---|---:|---:|---:|
| monitor runs | 80 | 136 KiB | 1.7 KiB/fila |
| monitor evidence | 371 | 1.40 MiB | 4.0 KiB/fila |
| change events | 371 | 672 KiB | 1.9 KiB/fila |
| AI analyses | 47 | 200 KiB | 4.4 KiB/fila |
| worker jobs | 39 | 144 KiB | 3.8 KiB/fila |

Los promedios incluyen overhead de tablas e índices y no son una factura
precisa. Para planificación se aplica margen 2× por índices, WAL, bloat y
variación de payload.

## Escenarios de capacidad

| Escenario | Carga diaria aproximada | Crecimiento monitor/año | Planificación 2× |
|---|---|---:|---:|
| 20 fuentes diarias, F=30, C=3 | 20 runs, 600 evidencias, 60 eventos | ~0.9 GB | ~1.8 GB |
| 100 mixtas, F=50, C=5 | 64 runs, 3.2k evidencias, 321 eventos | ~4.9 GB | ~9.8 GB |
| 1,000 diarias, F=20, C=2 | 1k runs, 20k evidencias, 2k eventos | ~30.8 GB | ~61.6 GB |

El proyecto definitivo está en plan Free y tiene 10.2 MB, 6/60 conexiones y
cero tablas RadarOH. El límite Free no es una base aceptable para ninguno de
los escenarios productivos.

## Carga representativa requerida

1. **Baseline:** 20 fuentes diarias, 30 ítems/fuente, 10% de cambio durante 24 h.
2. **Objetivo:** 100 fuentes mixtas, 50 ítems/fuente y 10% de cambio.
3. **Backlog:** una hora sin scheduler y posterior recuperación de 100 fuentes.
4. **Failover:** terminar el líder durante una llamada externa y verificar lease,
   advisory lock, recuperación y ausencia de duplicados.
5. **Errores:** tres fallos consecutivos por fuente y retry exponencial.
6. **IA:** 10k eventos pendientes en lotes de 25, incluyendo timeout, rate limit
   y respuestas rechazadas.
7. **API:** lecturas autenticadas, dashboard y búsquedas; mutaciones pesadas se
   mantienen dentro de sus límites de 10/15 min.

Aceptación inicial:

- p95 de rutas no pesadas <500 ms;
- error HTTP <1% durante steady state;
- conexiones DB sostenidas <70% del máximo y pico <85%;
- backlog de 100 fuentes drenado en <30 min;
- failover de worker <5 min;
- cero ejecuciones duplicadas;
- crecimiento y coste proyectados compatibles con 12 meses.

## Alertas requeridas

| Componente | Señal | Warning | Critical | Verificación en staging |
|---|---|---|---|---|
| Supabase | conexiones | >70% 10 min | >85% 5 min | abrir conexiones controladas y retirarlas |
| Supabase | tamaño DB | >60% cuota | >80% cuota | regla sintética contra métrica exportada |
| Supabase | backup/PITR | backup >26 h | restore/PITR no disponible | alerta de prueba + restore drill |
| Supabase | errores DB | aumento sostenido | auth/FATAL/read-only | credencial inválida en API aislada |
| Supabase | queries lentas | p95 >1 s | p95 >2 s 10 min | query de carga conocida |
| API | readiness | 1 fallo | 2 fallos consecutivos | apuntar API aislada a DB inválida |
| API | 5xx | >1% 10 min | >2% 5 min | endpoint de prueba controlado |
| API | latencia | p95 >500 ms | p95 >1 s | carga baseline/objetivo |
| API | scrape ausente | >3 min | >5 min | detener réplica de staging |
| Worker | líder ausente | >2 min | >3 min | detener líder |
| Worker | tick errors | 1 | ≥3 en 10 min | simular dependencia no disponible |
| Worker | lease perdido | 1 evento | repetición en 10 min | failover controlado |
| Worker | job `running` | >90 s | >2 min | proceso terminado durante job |
| Worker | cola | >50 o oldest >5 min | >100 u oldest >10 min | backlog sintético |
| Worker | fuente atrasada | >1.5× frecuencia | >2× frecuencia | fuente de prueba |
| IA | ratio error | >10%/h | >20%/h o 3 fallos seguidos | respuestas inválidas controladas |

Staging produjo 46 análisis IA en error y uno satisfactorio durante la rehearsal.
Ese caso demuestra que contar solo jobs no detecta un bucle de análisis fallidos;
la alerta debe usar `radar_ai_analyses`, tasa de error y antigüedad del último
éxito.

## Señales existentes y faltantes

Existentes:

- `/api/healthz`: liveness sin DB.
- `/api/readyz`: startup + `SELECT 1`.
- `/api/metrics`: requests, status class, latencia, worker ticks/jobs, lease,
  recuperación, readiness, liderazgo y jobs activos.

Faltan para operar:

- profundidad y antigüedad de cola;
- antigüedad de la fuente más retrasada;
- ratio de errores IA y último análisis satisfactorio;
- saturación/espera del pool PostgreSQL;
- latencia de fetch externo y OpenAI;
- persistencia/centralización de métricas entre reinicios y réplicas.

## Plan de runtime de producción

No se ha creado ningún login ni secreto.

1. Aplicar esquema con identidad owner solo después de aprobación.
2. Crear un login específico, por ejemplo `radar_production_runtime`, con:
   `LOGIN`, `NOINHERIT`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`,
   `NOBYPASSRLS`.
3. Conceder únicamente membresía en `radar_backend`.
4. Verificar que no pertenece a `radar_workspace_admin` y que no puede usar
   tablas fuera de una transacción que asuma `radar_backend`.
5. Usar Shared Pooler Session mode, puerto 5432 y SSL.
6. Dimensionar el pool antes de autoscale. El código actualmente usa el tamaño
   por defecto de `pg`; cada réplica y herramientas owner compiten por las 60
   conexiones actuales.
7. Mantener conexiones owner y runtime separadas.
8. Crear secretos de producción solo en la ventana aprobada:
   `SUPABASE_PRODUCTION_DB_SESSION_URL` y, si se valida conectividad,
   `SUPABASE_PRODUCTION_DB_DIRECT_URL`.
9. Configurar en cutover `DATABASE_URL`, `RADAR_DATABASE_PROVIDER=supabase`,
   `RADAR_WORKSPACE_UUID` y conservar `RADAR_WORKSPACE_ID=oh-casas`.

Verificación previa:

```sql
select current_user;
select rolcanlogin, rolinherit, rolbypassrls
from pg_roles where rolname = current_user;
select pg_has_role(current_user, 'radar_backend', 'member');
select pg_has_role(current_user, 'radar_workspace_admin', 'member');
```

## Índices probados en staging

Benchmark transaccional con tablas temporales:

| Candidato | Antes | Después | Decisión |
|---|---:|---:|---|
| `radar_sources(competitor_id)`; 200k filas | seq scan 28.262 ms | index scan 0.060 ms | mantener |
| `radar_ai_alerts(competitor_id)`; 500k filas | seq scan 67.246 ms | index scan 0.131 ms | mantener |
| `radar_monitor_evidence(run_id)`; 1M filas | índice existente 0.042 ms | duplicado 0.041 ms | rechazar duplicado |

El índice existente `(run_id, item_key)` ya cubre el tercer patrón. El duplicado
simulado ocupó ~9 MB por 1M filas sin mejora significativa. Los dos índices
aceptados permanecen en rehearsal staging y están versionados en la migración;
no se aplicaron al proyecto definitivo.
