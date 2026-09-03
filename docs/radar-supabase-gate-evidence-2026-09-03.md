# RadarOH: evidencia de gates P0/P1

## Alcance

Evidencia obtenida el 3 de septiembre de 2026 sin cutover ni cambios en Replit
producción o en el proyecto Supabase definitivo `Radar-OH`.

Acciones con escritura realizadas exclusivamente en el proyecto staging
`RadarOH-rehearsal-2026-09-03` (`jrjjwpletpfxthhobdlo`):

- aplicación de la migración idempotente `harden_rls_auto_enable`;
- análisis IA controlados con lotes de cinco evidencias.

No se cambiaron plan, secretos, logins, configuración productiva, freeze,
schema/datos del definitivo ni base activa.

## Resumen de estado

| Gate | Evidencia alcanzada | Estado global |
|---|---|---|
| P0-1 plan/backup | Proyecto y organización verificados read-only | BLOQUEADO: plan Free, backup/PITR no demostrado |
| P0-2 RPO/RTO | Propuesta y presupuesto operativo completos | BLOQUEADO: aceptación formal pendiente |
| P0-4 seguridad | Migración probada y advisor staging limpio | BLOQUEADO: definitivo no modificado |
| P1-1 job IA | Corrección, 33/33 tests y 3 éxitos staging | BLOQUEADO: no desplegado ni verificado en producción |

## P0-1 — Plan y backup/PITR

Verificación read-only:

- Organización Supabase: plan `free`.
- Proyecto definitivo: `ACTIVE_HEALTHY`.
- Región: `eu-central-1`.
- PostgreSQL: 17.6, canal GA.
- El proyecto definitivo continúa sin schema/datos RadarOH.
- La interfaz read-only disponible no aporta evidencia de una retención PITR
  compatible con RPO ≤15 minutos.

Conclusión:

- La verificación P0-1 está completada.
- El gate no puede cerrarse en plan Free.
- No se consultó precio ni se inició upgrade porque el usuario no autoriza
  cambios con coste.

## P0-2 — RPO/RTO

Propuesta preparada:

- operación normal: RPO ≤15 minutos y RTO ≤2 horas;
- worker listo ≤5 minutos después de DB ready;
- rollback durante freeze, antes de escrituras Supabase: RPO 0 y ≤30 minutos;
- restore drill aislado con presupuesto total de 110 minutos.

Documento:
`docs/radar-supabase-rpo-rto-restore-plan.md`.

Conclusión:

- La propuesta técnica está completa.
- Falta aceptación explícita del business owner/usuario.
- Aceptar P0-2 no autoriza un cambio de plan, restore, secreto ni acción
  productiva.

## P0-4 — `rls_auto_enable()`

### Definitivo, solo lectura

`public.rls_auto_enable()`:

- pertenece a `postgres`;
- devuelve `event_trigger`;
- es `SECURITY DEFINER`;
- tiene `search_path=pg_catalog`;
- habilita RLS tras crear tablas en `public`;
- `PUBLIC`, `anon` y `authenticated` tienen `EXECUTE`;
- Security Advisor mantiene los warnings 0028 y 0029.

No se cambió el definitivo.

### Staging

Antes del hardening:

- la función no existía;
- Security Advisor no reportaba lints de seguridad.

Se añadió la migración versionada:
`supabase/migrations/0002_harden_rls_auto_enable.sql`.

La migración:

- es idempotente;
- no crea la función;
- si existe, revoca `EXECUTE` a `PUBLIC`, `anon` y `authenticated`;
- conserva owner y `service_role`.

Evidencia posterior:

- migración `harden_rls_auto_enable` registrada en staging;
- Security Advisor staging: cero lints de seguridad.

Conclusión:

- La remediación está probada en staging.
- El gate global permanece bloqueado hasta aplicar la migración al definitivo
  con aprobación explícita y comprobar allí ambos privilegios/advisor.

Referencias:

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## P1-1 — Job IA

### Causas corregidas

1. El modelo confundía `change_event_id` con `evidence_id`.
2. Podía inventar el `change_event_id` de un finding aunque citara una única
   evidencia válida.
3. El selector examinaba solo los eventos más recientes antes de descartar los
   ya analizados, dejando sin procesar backlog antiguo.

### Controles implementados

- `evidence_ids` que coinciden con un evento conocido se mapean únicamente a la
  evidencia persistida asociada.
- Un `change_event_id` desconocido se corrige solo cuando todas las evidencias
  citadas identifican exactamente un evento.
- Cualquier ID desconocido o relación ambigua sigue rechazando la respuesta.
- El prompt prohíbe explícitamente usar un event ID como evidence ID.
- La consulta selecciona eventos pendientes mediante `NOT EXISTS`, antes del
  `LIMIT`.
- Runner opt-in de staging; exige proveedor Supabase, UUID y confirmación
  explícita.

### Evidencia automática

- API: 33/33 tests.
- TypeScript API: correcto.
- `git diff --check`: correcto.

### Evidencia staging

Últimos tres análisis controlados:

| Inicio UTC | Estado | Evidencias | Intentos | Errores de intento |
|---|---|---:|---:|---:|
| 09:23:57 | success | 5 | 1 | 0 |
| 09:24:32 | success | 5 | 1 | 0 |
| 09:25:03 | success | 5 | 1 | 0 |

Estado posterior:

- 7 análisis exitosos;
- 46 análisis históricos fallidos;
- 27 findings;
- 0 análisis `running`;
- 0 worker jobs `running`;
- los tres lotes finales produjeron cinco findings cada uno.

Conclusión:

- La remediación de P1-1 está validada en staging.
- El gate global permanece bloqueado hasta un deploy productivo autorizado y
  una ventana de observación sin reintentos inválidos.
- El workflow productivo no se reinició y continúa ejecutando el código previo.

## Implicación para el baseline

Las pruebas IA añadieron análisis y findings únicamente en staging. Por tanto,
los conteos 47 análisis / 2 findings del snapshot original ya no representan el
estado actual del rehearsal.

Antes de la rehearsal final:

1. crear un snapshot/freeze nuevo;
2. cargarlo en un target aislado limpio;
3. ejecutar el harness con el nuevo manifest;
4. no reutilizar estos conteos como baseline de cutover.
