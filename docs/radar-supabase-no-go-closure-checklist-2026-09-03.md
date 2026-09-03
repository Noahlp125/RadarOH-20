# RadarOH: checklist para cerrar los bloqueantes NO-GO

## Alcance y regla de seguridad

Este documento es un plan de ejecución, no una autorización. Mientras no se
marque cada gate como completo:

- Replit PostgreSQL continúa siendo la base activa.
- No se ejecuta cutover ni se migran datos de producción.
- No se crean roles ni secretos de producción.
- No se aplican migraciones al proyecto definitivo `Radar-OH`.
- Las verificaciones sobre producción son read-only.

Estados permitidos: `PENDIENTE`, `EN CURSO`, `BLOQUEADO`, `COMPLETO`.
Cada evidencia debe guardar fecha/hora UTC, proyecto/ref, operador y enlace al
log o informe, sin incluir secretos.

## Prioridad y dependencias

- **P0 — recuperación/seguridad:** no se puede aceptar una carga productiva sin
  estos gates.
- **P1 — operación/capacidad:** debe completarse antes de fijar una ventana.
- **P2 — ejecución controlada:** solo después de cerrar P0/P1 y obtener la
  aprobación explícita del cutover.

Dependencias principales:

```text
P0-1 plan/backup → P0-2 RPO/RTO → P0-3 restore drill
P0-4 security fix ───────────────────────────────┐
P1-1 AI stabilization → P1-2 load/capacity → P1-3 alerts
P1-4 runtime plan/test ──────────────────────────┤
                                                 ↓
P2-1 definitive rehearsal → P2-2 window/operators
                         → P2-3 final snapshot → P2-4 cutover gate
```

---

## P0-1 — Plan y capacidad de backup de Supabase

**Estado:** PENDIENTE. La organización está en plan Free; el proyecto
definitivo está vacío y sano, pero no ofrece evidencia suficiente de backup/PITR
productivo.

1. **Acción exacta**
   - Confirmar con el owner de la organización el plan productivo requerido.
   - Verificar cuota de base de datos, almacenamiento, conexiones, backups
     automáticos, retención y disponibilidad de PITR.
   - Confirmar región `eu-central-1` o aprobar una alternativa.
   - No crear proyecto, branch ni secreto durante esta verificación.
2. **Entorno**
   - Lectura de proyecto/plan: producción, read-only.
   - Cambio de plan o facturación: organización/producción, requiere acción
     administrativa.
3. **Evidencia de cierre**
   - Plan y cuota visibles en el panel/API.
   - Retención y PITR documentados para `Radar-OH`.
   - Captura o export de configuración sin credenciales.
4. **Aprobación**
   - Tú como owner del cutover y el owner de la organización/finanzas.
5. **Riesgos/prerrequisitos**
   - Coste recurrente, cambio de cuota o ventana de mantenimiento del proveedor.
   - No asumir que el plan staging o la documentación general aplican al
     proyecto definitivo.
6. **Downtime**
   - Ninguno esperado para la verificación; un upgrade puede tener una ventana
     propia que debe confirmar el proveedor.
7. **Rollback**
   - No tratar un downgrade como rollback de DR. Conservar el plan que cumpla
     RPO/RTO hasta después del cutover y restore drill.

## P0-2 — Aceptación formal de RPO/RTO

**Estado:** PENDIENTE. La propuesta es RPO ≤15 minutos, RTO ≤2 horas y RPO 0
durante el freeze previo a la primera escritura Supabase.

1. **Acción exacta**
   - Revisar `docs/radar-supabase-rpo-rto-restore-plan.md`.
   - Aceptar o cambiar los objetivos, el presupuesto de 110 minutos y las
     responsabilidades.
   - Definir quién puede declarar incidente, restaurar y reabrir escrituras.
2. **Entorno**
   - Decisión operativa; no requiere acceso ni escritura en producción.
3. **Evidencia de cierre**
   - Registro fechado con RPO, RTO, retención mínima, escalado y criterio de
     aceptación del restore drill.
4. **Aprobación**
   - Tú y el business owner; DB/operaciones deben confirmar viabilidad.
5. **Riesgos/prerrequisitos**
   - Un RPO de 15 minutos no es alcanzable con solo backup diario.
   - El RTO depende de tiempos de provisión del proveedor, no solo del código.
6. **Downtime**
   - Ninguno para aceptar objetivos; el drill aislado no interrumpe producción.
7. **Rollback**
   - Si no se aceptan los objetivos, el estado permanece NO-GO. No reducirlos
     para encajar una ventana.

## P0-3 — Verificación PITR y restore drill

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Verificar la configuración activa de backup/PITR del proyecto definitivo.
   - Restaurar un punto conocido en un proyecto, branch o entorno aislado.
   - Ejecutar el procedimiento cronometrado del documento RPO/RTO.
   - Validar esquema, roles, RLS, conteos, IDs, FKs, JSON, readiness, locks y
     recuperación del worker.
2. **Entorno**
   - El restore y las pruebas deben ser staging/preproducción aislada.
   - La verificación de configuración del definitivo puede ser read-only.
   - Crear un branch/restore puede tener coste y requiere aprobación.
3. **Evidencia de cierre**
   - Punto restaurado, timestamps de inicio/ready, RPO calculado y RTO medido.
   - Salida verde del harness y del smoke test.
   - Cero IDs perdidos, huérfanos FK, doble líder o duplicados.
4. **Aprobación**
   - Tú para crear el entorno/coste; DB operator y validator para aceptar la
     evidencia; business owner para aceptar RPO/RTO.
5. **Riesgos/prerrequisitos**
   - No restaurar encima del definitivo.
   - No copiar secretos de producción al entorno de prueba.
   - Requiere cerrar P0-1 y P0-2.
6. **Downtime**
   - Cero en producción; la prueba aislada puede tardar hasta 110 minutos.
7. **Rollback**
   - Eliminar o aislar el entorno restaurado tras guardar evidencia.
   - No hacer rollback de producción porque el drill sea lento: mantener
     NO-GO y corregir el procedimiento.

## P0-4 — Eliminar los warnings de seguridad

**Estado:** PENDIENTE. El definitivo reporta dos warnings sobre
`public.rls_auto_enable()` ejecutable por `anon` y `authenticated`.

1. **Acción exacta**
   - Reproducir el warning en un entorno aislado.
   - Decidir si la función debe existir públicamente.
   - Si no es una RPC pública, revocar `EXECUTE` a `anon` y `authenticated` y
     moverla a un esquema no expuesto o cambiarla a `SECURITY INVOKER` según
     revisión.
   - Probar el arranque/migración RadarOH sin esa función.
2. **Entorno**
   - Desarrollo/staging primero.
   - Aplicar el DDL al definitivo requiere acceso de producción y aprobación
     explícita.
3. **Evidencia de cierre**
   - Security Advisor sin los dos warnings.
   - `has_function_privilege` confirma que los roles públicos no ejecutan la
     función.
   - Harness, API y RLS siguen verdes.
4. **Aprobación**
   - Tú y el DB/security owner; revisión del responsable de la migración.
5. **Riesgos/prerrequisitos**
   - Revocar una función usada por una migración puede bloquear el bootstrap.
   - No cambiar permisos directamente en producción sin una migración revisada.
6. **Downtime**
   - Ninguno esperado, pero reservar reinicio/validación de API.
7. **Rollback**
   - Revertir solo mediante migración revisada en un entorno controlado.
   - No restaurar permisos públicos inseguros solo para obtener un deploy verde.

## P1-1 — Estabilizar el job de IA

**Estado:** PENDIENTE. El worker Replit está agotando tres intentos porque la
salida IA referencia IDs de evidencia desconocidos. La validación funciona, pero
el scheduler sigue creando análisis en error.

1. **Acción exacta**
   - Reproducir con fixtures de evidencia conocidos en staging.
   - Corregir el contrato de prompt/mapeo o la normalización de IDs.
   - Añadir una regresión que rechace IDs inválidos sin iniciar un bucle
     continuo.
   - Ejecutar al menos tres análisis scheduler consecutivos satisfactorios,
     con findings y alertas respaldados.
   - Definir una pausa operativa segura si la corrección no está lista.
2. **Entorno**
   - Diagnóstico y pruebas: staging/preproducción.
   - Deploy o pausa del scheduler activo: producción, requiere aprobación.
3. **Evidencia de cierre**
   - Cero referencias desconocidas en una ventana acordada.
   - Ratio de error IA bajo el umbral acordado.
   - Tres análisis consecutivos exitosos, alertas correctas y sin duplicados.
   - Métricas y logs muestran que no se consumen tres retries por ciclo.
4. **Aprobación**
   - Tú para deploy/pausa productiva; owner de producto para aceptar IA
     degradada temporalmente.
5. **Riesgos/prerrequisitos**
   - Cambiar prompts puede alterar calidad, coste y falsos positivos.
   - Pausar IA deja eventos sin analizar y aumenta backlog.
   - El job no debe ocultar findings inválidos eliminando evidencia.
6. **Downtime**
   - Deploy rolling: ninguno esperado.
   - Pausar IA: sin downtime API, pero con degradación funcional explícita.
7. **Rollback**
   - Revertir el código solo si se conserva la validación de evidencia.
   - Si se pausa, reanudar únicamente tras comprobar que el contrato está
     corregido; no acumular backlog indefinidamente.

## P1-2 — Carga, crecimiento y capacidad

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Ejecutar baseline de 20 fuentes, objetivo de 100 fuentes y backlog de 1.000
     fuentes en staging/preproducción con datos sintéticos.
   - Medir steady state, recuperación tras una hora de scheduler detenido,
     retries, failover de líder, IA con 10k eventos y payloads grandes.
   - Calcular crecimiento 30/90/365 días y coste de DB, WAL, egress e IA.
2. **Entorno**
   - Staging/preproducción únicamente. No generar carga sintética contra
     producción.
   - Métricas de producción actuales pueden consultarse read-only.
3. **Evidencia de cierre**
   - p95 no pesado <500 ms, error HTTP <1%, conexiones sostenidas <70%.
   - Backlog de 100 fuentes drenado en <30 min.
   - Failover de worker <5 min, sin doble ejecución ni duplicados.
   - Proyección documentada para 12 meses con margen 2×.
4. **Aprobación**
   - Tú o el tech owner para aceptar umbrales; owner financiero si el test
     consume IA, egress o un entorno con coste.
5. **Riesgos/prerrequisitos**
   - El scheduler es secuencial y la IA está serializada; los límites teóricos
     no son throughput sostenible.
   - Necesita P1-1 estable para que el escenario IA sea interpretable.
6. **Downtime**
   - Ninguno en producción; el entorno de prueba puede degradarse o reiniciarse.
7. **Rollback**
   - Borrar solo datos sintéticos del entorno de prueba mediante su cleanup
     controlado.
   - No eliminar índices ni ajustar producción por un resultado aislado.

## P1-3 — Monitoring y alertas

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Implementar o seleccionar destino de alertas para Supabase, API y worker.
   - Configurar los umbrales de
     `docs/radar-supabase-capacity-monitoring-runtime-plan.md`.
   - Añadir queue depth, oldest job, source freshness, pool saturation y ratio
     IA si las señales actuales no bastan.
   - Probar incidentes sintéticos: DB no ready, 5xx, líder detenido, lease
     perdido, backlog y tres retries IA.
2. **Entorno**
   - Definición y pruebas: staging/preproducción.
   - Configuración de alertas del servicio productivo: acceso de producción.
3. **Evidencia de cierre**
   - Cada alerta genera una notificación, tiene owner, severidad, runbook y
     confirmación de recepción.
   - No hay alertas críticas huérfanas ni métricas de alta cardinalidad.
   - Dashboard conserva señales a través de reinicios y réplicas.
4. **Aprobación**
   - Tú/ops owner para producción; responsable de guardia para severidades y
     tiempos de respuesta.
5. **Riesgos/prerrequisitos**
   - `/api/metrics` es local y se reinicia; no confundir una réplica sana con el
     estado agregado.
   - Alertas demasiado sensibles generan fatiga; demasiado laxas ocultan DR.
6. **Downtime**
   - Ninguno esperado.
7. **Rollback**
   - Revertir reglas o destino de notificación, conservando las reglas
     mínimas de readiness, 5xx, backup, líder y conexiones.

## P1-4 — Runtime login y Session Pooler

**Estado:** PENDIENTE. El plan está documentado, pero no existe login ni secreto
de producción.

1. **Acción exacta**
   - Probar en staging un login `NOINHERIT`, `NOBYPASSRLS`, sin crear DB/roles ni
     replicación, miembro solo de `radar_backend`.
   - Confirmar Shared Pooler Session mode, puerto 5432, SSL y dos sesiones de
     advisory lock.
   - Dimensionar pool por número de réplicas frente al límite de conexiones.
   - Preparar nombres de secretos, sin valores.
2. **Entorno**
   - Prueba: staging/preproducción.
   - Crear login o secreto productivo: producción, requiere aprobación explícita.
3. **Evidencia de cierre**
   - SQL de atributos y membresías sin secretos.
   - Readiness, RLS, API, worker lease y locks verdes.
   - Confirmación de que el runtime no puede asumir
     `radar_workspace_admin`.
4. **Aprobación**
   - Tú y DB/security owner para crear el login; tú para guardar secretos.
5. **Riesgos/prerrequisitos**
   - No usar el owner como runtime.
   - No usar Transaction mode para el worker.
   - No imprimir URLs ni passwords en logs.
6. **Downtime**
   - Ninguno al preparar credenciales; el cambio de `DATABASE_URL` pertenece al
     cutover y usa una ventana de 90–120 minutos.
7. **Rollback**
   - Antes de aceptar escrituras, volver a Replit es configuración-only.
   - Tras la primera escritura Supabase, requiere reverse-delta; no hacer
     rollback directo.

## P2-1 — Rehearsal segura contra el proyecto definitivo

**Estado:** PENDIENTE. `Radar-OH` está vacío; la rehearsal completa no se ha
ejecutado allí por la frontera read-only.

1. **Acción exacta**
   - Preferir branch/restore aislado del definitivo, o preproducción aprobada.
   - Aplicar esquema, cargar snapshot no productivo, crear runtime de prueba y
     ejecutar el harness completo.
   - Capturar advisors antes/después y repetir smoke/API/worker/JSON.
2. **Entorno**
   - Branch/restore/preproducción; nunca contra el definitivo activo sin
     aprobación explícita.
3. **Evidencia de cierre**
   - Harness verde, counts/IDs/FKs/RLS correctos, security advisor limpio,
     locks/lease correctos, load test y restore evidence adjuntos.
4. **Aprobación**
   - Tú para crear branch/restore o cargar datos; DB owner para la ejecución.
5. **Riesgos/prerrequisitos**
   - Puede haber coste de branch/proyecto.
   - Un target parcial no se limpia ni reutiliza automáticamente; preparar uno
     nuevo para cada intento.
   - Requiere P0-3, P0-4, P1-1 y P1-4.
6. **Downtime**
   - Cero si se usa branch/restore aislado.
7. **Rollback**
   - Eliminar el branch/restore aislado tras guardar evidencia.
   - Si se carga el definitivo por excepción, no truncar para deshacer: dejarlo
     aislado y preparar un target nuevo.

## P2-2 — Ventana, operadores y autorización de cutover

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Nombrar cutover lead, DB operator, application operator, worker operator,
     validator y business owner.
   - Reservar ventana de 90 minutos con límite operativo de 120.
   - Confirmar canal de incidente, checklist impreso, rollback deadline y
     responsable único de activar el worker.
2. **Entorno**
   - Decisión y coordinación; la ejecución posterior requiere producción.
3. **Evidencia de cierre**
   - Calendario, responsables, contactos, checklist firmado y criterios GO/NO-GO.
4. **Aprobación**
   - Tú y business owner; lead operativo confirma capacidad de guardia.
5. **Riesgos/prerrequisitos**
   - No programar con fuentes críticas activas ni sin restore aprobado.
   - La ventana debe incluir validación, no solo la copia de datos.
6. **Downtime**
   - Escrituras congeladas durante aproximadamente 90 minutos; reservar 120.
   - Lecturas pueden permanecer disponibles durante parte de la operación, pero
     no debe prometerse disponibilidad completa.
7. **Rollback**
   - Antes de la primera escritura Supabase, rollback de configuración en ≤30
     minutos.
   - Después, reverse-delta revisado; nunca cambiar dos workers a activo.

## P2-3 — Snapshot final, migración y gates de ejecución

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Activar freeze en Replit y desactivar worker solo en la ventana aprobada.
   - Ejecutar snapshot `REPEATABLE READ READ ONLY`, JSON y SHA-256.
   - Capturar counts, IDs, timestamps, estados, fingerprints y backup point.
   - Aplicar esquema y migrar al target definitivo vacío.
   - Ejecutar harness y smoke tests antes del switch.
2. **Entorno**
   - Snapshot fuente read-only: producción, pero requiere autorización para
     activar el freeze.
   - Schema/data migration y switch: producción, explícitamente aprobados.
3. **Evidencia de cierre**
   - Manifest del snapshot, checksum, counts equivalentes, todos los IDs
     presentes, harness verde, API ready, RLS correcto y cero jobs activos.
4. **Aprobación**
   - Tú, cutover lead, DB operator y validator; business owner antes de
     reabrir escrituras.
5. **Riesgos/prerrequisitos**
   - La base origen sigue cambiando hasta el freeze.
   - No iniciar ambos workers.
   - No continuar si aparecen escrituras, drift o target parcial.
6. **Downtime**
   - Freeze y validación: dentro de la ventana de 90–120 minutos.
7. **Rollback**
   - Antes de abrir escrituras Supabase: volver a Replit y eliminar solo la
     configuración temporal.
   - Después: no usar rollback simple; congelar ambos lados y ejecutar
     reverse-delta aprobado.

## P2-4 — Switch, smoke tests y observación posterior

**Estado:** PENDIENTE.

1. **Acción exacta**
   - Cambiar API a runtime Supabase manteniendo freeze.
   - Verificar `/api/healthz`, `/api/readyz`, `/api/metrics`, 401 protegido,
     lecturas, JSON y RLS.
   - Reabrir mutaciones con aprobación.
   - Habilitar un único worker y ejecutar una monitorización controlada.
   - Observar 24 horas: 5xx, p95, conexiones, backlog, freshness, IA, locks,
     duplicados y crecimiento.
2. **Entorno**
   - Producción; requiere aprobación del gate de punto de no retorno.
3. **Evidencia de cierre**
   - Smoke checklist firmado, primera mutación auditada, worker leader/lease
     correctos, monitor sin duplicados y 24 h dentro de umbrales.
4. **Aprobación**
   - Tú y business owner; cutover lead decide GO/rollback según criterios.
5. **Riesgos/prerrequisitos**
   - La primera escritura aceptada elimina el rollback de configuración-only.
   - El tráfico activo puede crear drift desde el snapshot.
6. **Downtime**
   - Sin downtime total esperado, pero con escrituras bloqueadas durante la
     ventana y posible degradación funcional.
7. **Rollback**
   - Antes de primera escritura: rollback a Replit.
   - Después: reverse-delta con ambos sistemas congelados y aprobación separada.

---

## Orden recomendado de ejecución

1. Mantener producción sin cambios y registrar el owner de cada gate.
2. Aceptar RPO/RTO y confirmar plan/capacidad de backup.
3. Verificar PITR y ejecutar restore drill aislado.
4. Resolver en preproducción el warning `rls_auto_enable()`.
5. Estabilizar el job IA y confirmar análisis/alerta exitosos.
6. Ejecutar carga, crecimiento y failover en staging/preproducción.
7. Configurar y probar alertas.
8. Probar login runtime y Session Pooler en staging.
9. Repetir la rehearsal en branch/restore aislado o preproducción autorizada.
10. Acordar ventana, responsables, rollback deadline y criterios GO.
11. Solo con aprobación explícita: freeze, snapshot, migración y validación del
    proyecto definitivo.
12. Solo con una segunda aprobación explícita: switch, primera escritura y
    worker.
13. Observar 24 horas y decidir la retención de Replit en una revisión separada.

## Pasos que requieren exactamente tu aprobación explícita

No se ejecutan automáticamente:

- cambiar el plan o incurrir en coste Supabase;
- crear branch, restore o preproducción con coste;
- aplicar DDL, schema o datos al proyecto definitivo;
- modificar permisos de `rls_auto_enable()` en el definitivo;
- crear el login runtime de producción;
- crear o modificar secretos de producción;
- configurar alertas productivas o cambiar configuración productiva;
- pausar, desplegar o reactivar el worker/job IA de producción;
- activar el freeze productivo;
- migrar el snapshot o cambiar la API al definitivo;
- aceptar la primera escritura Supabase;
- habilitar el worker Supabase;
- ejecutar cualquier rollback posterior a la primera escritura.

Las lecturas read-only de estado, advisors, logs, plan, capacidad y sesiones no
requieren esta aprobación, pero deben quedar registradas y nunca exponer
credenciales.
