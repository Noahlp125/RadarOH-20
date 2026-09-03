# RadarOH: propuesta RPO/RTO y restore drill

## Estado

Esta es una propuesta operativa para aprobación. No afirma que Supabase ya
cumpla estos objetivos.

El proyecto definitivo identificado es `Radar-OH`
(`pimjbwqndcrpeswstbog`, `eu-central-1`). Está activo y sano, pero la
organización está en plan Free y el proyecto no contiene migraciones, tablas,
políticas ni roles RadarOH. PITR no está verificado y no se ha ejecutado ningún
restore drill.

## Objetivos propuestos

| Situación | RPO | RTO |
|---|---:|---:|
| Operación normal tras cutover | ≤15 minutos | ≤2 horas hasta API read-only/read-write validada |
| Recuperación del worker tras restaurar DB | Mismo RPO de DB | ≤5 minutos después de que la DB esté ready |
| Cutover antes de aceptar escrituras en Supabase | 0 | ≤30 minutos para volver a Replit |
| Sin PITR verificado | ≤24 horas como máximo teórico | No aceptable para GO |

El objetivo productivo es **RPO ≤15 min / RTO ≤2 h**. Un backup diario sin
PITR no lo cumple y mantiene el cutover en NO-GO.

## Supuestos

- Una parte de las evidencias públicas puede volver a obtenerse, pero plan,
  preferencias, alertas, auditoría e histórico no deben considerarse
  reconstruibles.
- Solo un worker líder opera por workspace mediante lease y advisory locks.
- El runtime usa Shared Pooler Session mode; Transaction mode queda excluido.
- Existe un operador con permiso para restaurar, otro para validar la
  aplicación y un responsable que autoriza reapertura de escrituras.
- Backup/PITR cubre PostgreSQL completo, incluidos esquema, roles, RLS,
  relaciones y datos.
- Las credenciales del proyecto restaurado se entregan mediante secretos
  separados; nunca se copian por logs o chat.

## Presupuesto de tiempo del RTO

| Fase | Presupuesto |
|---|---:|
| Declarar incidente, freeze y detener worker | 10 min |
| Seleccionar punto y lanzar restore aislado | 45 min |
| Preparar runtime aislado y Session Pooler | 15 min |
| Validar esquema, RLS, conteos e IDs | 25 min |
| Smoke tests y decisión de reapertura | 15 min |
| **Total objetivo** | **110 min** |

Quedan 10 minutos de margen sobre el RTO de dos horas. Si el proveedor tarda
más de 45 minutos en entregar el restore, el objetivo debe revisarse o escalarse
el plan/capacidad.

## Procedimiento de restore drill cronometrado

El drill siempre restaura a un proyecto aislado. Nunca sobrescribe producción.

1. Registrar hora UTC de inicio, participantes, backup/PITR elegido y punto
   objetivo.
2. Confirmar que el ejercicio no cambia producción. Si se simula un incidente
   de aplicación, activar freeze solo en el runtime aislado.
3. Crear o seleccionar el restore aislado mediante el mecanismo oficial del
   plan aprobado.
4. Registrar cuándo PostgreSQL acepta conexiones y calcular tiempo de
   provisión.
5. Con la conexión owner del restore:
   - comprobar versión PostgreSQL y migraciones;
   - comparar tablas, constraints, índices, triggers, roles y políticas RLS;
   - validar conteos por tabla;
   - comprobar UUID, `legacy_id`, FKs, fingerprints y relaciones IA/evidencia;
   - verificar que no hay jobs o análisis indebidamente en `running`.
6. Crear una credencial runtime exclusiva del ejercicio, miembro solo de
   `radar_backend`, y conectarla por Session Pooler.
7. Ejecutar el harness completo con write-freeze y worker desactivado.
8. Iniciar una API aislada y validar:
   - `/api/healthz` y `/api/readyz` = 200;
   - ruta protegida sin sesión = 401;
   - mutaciones congeladas = 503;
   - lecturas autorizadas conservan el contrato JSON.
9. Ejecutar la prueba de dos sesiones para advisory locks.
10. En un workspace de ejercicio, reabrir escrituras de forma controlada,
    ejecutar una monitorización manual y comprobar que no crea duplicados.
11. Medir:
    - RPO real: diferencia entre la última transacción esperada y la última
      transacción recuperada;
    - RTO real: inicio del incidente simulado hasta readiness y validación.
12. Guardar evidencia, retirar credenciales del ejercicio y eliminar/aislar el
    restore según la política aprobada.

## Criterios de aceptación

- RPO medido ≤15 minutos.
- Readiness validada en ≤2 horas.
- Worker líder recuperado en ≤5 minutos desde readiness.
- Cero IDs preexistentes desaparecidos dentro del punto restaurado.
- Cero huérfanos FK y aislamiento RLS correcto.
- Sin doble líder ni duplicados tras la monitorización controlada.
- Evidencia del ejercicio revisada por operador, validador y responsable GO.

## Bloqueos actuales

- Plan Free en la organización Supabase.
- PITR/retención del proyecto definitivo no observable ni confirmado.
- No existe restore aislado ni medición de tiempos.
- No hay autorización para crear branch/proyecto, roles o secretos.

Referencias oficiales:

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Point-in-Time Recovery](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
