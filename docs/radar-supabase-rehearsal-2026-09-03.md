# RadarOH Supabase staging rehearsal — 2026-09-03

## Resultado

La rehearsal de migración de RadarOH desde Replit PostgreSQL a Supabase
PostgreSQL terminó correctamente en un proyecto staging desechable. No se hizo
cutover, no se cambió producción y Replit PostgreSQL se mantuvo intacto como
origen.

- Staging: `RadarOH-rehearsal-2026-09-03`
- Project ref: `jrjjwpletpfxthhobdlo`
- Región: `eu-central-1`
- Transporte validado: Shared Pooler, Session mode, puerto 5432
- Motivo: el endpoint directo era IPv6-only y el runtime de Replit no tenía
  conectividad IPv6

## Snapshot y migración final

El snapshot definitivo se tomó con `REPEATABLE READ` y `READ ONLY`, con API en
write-freeze y worker desactivado. No había jobs, monitor runs ni análisis IA en
estado `running`.

| Entidad | Origen | Staging |
|---|---:|---:|
| Workspaces | 1 | 1 |
| Competidores | 14 | 14 |
| Keywords | 15 | 15 |
| Fuentes | 38 | 38 |
| Plan items | 8 | 8 |
| Imports | 1 | 1 |
| Monitor runs | 80 | 80 |
| Monitor evidence | 371 | 371 |
| Change events | 371 | 371 |
| AI analyses | 47 | 47 |
| AI findings | 2 | 2 |
| AI alerts | 1 | 1 |
| Activity log | 55 | 55 |
| Alert preferences | 1 | 1 |
| Worker jobs | 39 | 39 |
| Worker leases | 1 | 1 |

Tablas normalizadas adicionales en staging:

- `radar_source_runtime`: 38
- `radar_ai_analysis_evidence`: 3
- `radar_ai_finding_evidence`: 3
- `radar_workspace_members`: 0

## Bloqueantes encontrados y resueltos

1. Los números devueltos como texto se convertían a `0`. El runner ahora acepta
   números PostgreSQL tanto en forma numérica como textual.
2. Los valores JSONB y los arrays de evidencias se enviaban como arrays
   PostgreSQL. El runner ahora serializa explícitamente los parámetros JSONB.
3. Supabase devuelve `horizon` como número, mientras que la API lo comparaba
   como texto. La lectura ahora normaliza ambos formatos antes de construir el
   plan `30/60/90`.
4. Un job huérfano impedía el snapshot inicial. Se recuperó con el worker normal
   antes del snapshot definitivo; no se alteró manualmente su estado.

Tras descubrir el problema de `horizon`, las 23 tablas `radar_*` del staging se
vaciaron y la migración se repitió desde cero. El proyecto, esquema, roles y
migraciones se conservaron.

## Validaciones completadas

### Integridad y seguridad

- Conteos del snapshot y staging: iguales.
- IDs UUID y `legacy_id`/`legacy_key`: válidos, presentes y únicos.
- Relaciones y FKs: cero huérfanos.
- RLS: 23 tablas y 92 policies.
- Privilegios directos para `anon` y `authenticated`: ninguno.
- Supabase Security Advisor: cero hallazgos.
- Login runtime sin `BYPASSRLS`, miembro de `radar_backend` y no miembro de
  `radar_workspace_admin`.
- El runtime ve 38 fuentes del workspace correcto y cero con un workspace falso.
- El runtime no puede asumir el rol administrador.

### Constraints transaccionales

Las pruebas se ejecutaron en staging dentro de transacciones revertidas:

- FK entre workspaces: rechazada (`23503`).
- `horizon` inválido: rechazado (`23514`).
- `legacy_id` duplicado: rechazado (`23505`).
- Borrado de una fuente con historial: rechazado (`23503`).

### API, worker y locks

- API aislada conectada a staging con el login runtime:
  - health: 200
  - readiness: 200
  - ruta protegida sin sesión: 401
  - mutación durante write-freeze: 503
  - bootstrap omitido y worker desactivado
- Worker aislado en un workspace temporal vacío:
  - adquirió un único lease
  - recuperó cero trabajos interrumpidos
  - no creó monitor runs ni análisis
  - el workspace temporal y sus filas fueron eliminados después
- Advisory locks con dos conexiones Session pooler:
  - primera sesión adquirió el lock
  - segunda sesión quedó bloqueada
  - segunda sesión pudo adquirirlo tras liberación

### Monitorización, IA y JSON

- Distribuciones de estados de monitor runs, análisis IA y worker jobs: iguales
  entre origen y staging.
- 371 evidencias con fingerprint en ambos lados.
- Relaciones normalizadas de evidencias IA: cero huérfanos.
- Export/import JSON:
  - 38 fuentes
  - 14 competidores
  - 15 keywords
  - 8 plan items
  - mismos IDs y mismo hash canónico tras ordenar las colecciones por ID

Las importaciones de prueba añaden registros de auditoría en el staging. Esto es
intencional y no afecta al origen.

## Rollback ensayado

El rollback se ejecutó manteniendo el write-freeze:

1. Se capturaron todos los IDs del origen.
2. Se detuvo la API aislada de staging.
3. Se retiraron los flags temporales de development.
4. La API volvió a arrancar sobre Replit PostgreSQL.
5. Health y readiness devolvieron 200.
6. Las mutaciones dejaron de devolver 503 y volvieron al control normal de
   autenticación.
7. Ninguno de los IDs capturados desapareció.

Al reactivar el worker normal se crearon un análisis y una actividad nuevos en
Replit. Son escrituras operativas posteriores al rollback, no pérdida ni
sobrescritura de datos.

Supabase staging quedó intacto para investigación. No se eliminó el proyecto.

## Riesgos no bloqueantes antes de un cutover real

- Supabase Performance Advisor reporta 21 FKs sin índice de cobertura. Deben
  revisarse contra los patrones reales de consulta y borrado antes del cutover.
- Reporta 10 índices no usados; este resultado no es concluyente en un staging
  recién creado sin tráfico representativo.
- Confirmar backup/PITR, ventana de mantenimiento, capacidad y alertas del
  proyecto definitivo.
- Ejecutar el cutover solo con una URL Session pooler o conexión directa que
  conserve sesiones; Transaction mode no es compatible con los advisory locks
  del worker.
- El login temporal de rehearsal debe eliminarse al desmantelar el staging o
  rotarse antes de reutilizarlo.

## Veredicto

La mecánica de snapshot, migración, compatibilidad runtime, RLS, worker, JSON y
rollback queda demostrada. No hay un cutover autorizado. El proyecto definitivo
no debe cambiarse hasta cerrar los riesgos operativos y de rendimiento
anteriores.