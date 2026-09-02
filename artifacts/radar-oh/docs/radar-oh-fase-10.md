# RadarOH — Fase 10: operación y resiliencia

## Topología actual y límites

La aplicación es un cliente React/Vite, una API Express y PostgreSQL administrado de Replit. La API sirve las rutas públicas operativas `/api/healthz`, `/api/readyz` y `/api/metrics`; el resto de Radar requiere sesión Clerk y autorización. El mismo proceso API inicia el worker durable. No hay proveedor, cola ni scheduler externo añadido.

El worker se coordina entre instancias con un lease PostgreSQL y un advisory lock por trabajo durante la operación externa. Por tanto el límite es **un worker líder activo por workspace**, aunque haya varias réplicas API. El estado, reintentos y recuperación de trabajos viven en PostgreSQL. Una caída puede dejar trabajo para recuperación tras expirar el lease; un timeout externo ya iniciado no es “deshecho”.

## HA, despliegue y capacidad

- Para tráfico variable, usar **Replit Autoscale** para la web/API, con mínimo de instancias decidido por el operador. Autoscale no sustituye la prueba de failover ni garantiza afinidad del proceso worker.
- Elegir **Reserved VM** si se requiere capacidad siempre encendida, latencia predecible, controles de host o un presupuesto estable. Sigue manteniéndose un único líder por el lease.
- El operador debe configurar dominio, health checks/alertas, límites de escalado, presupuesto y permisos de producción. El código no garantiza SLA, disponibilidad de Replit, backups ni recuperación administrada.
- Revisar la documentación oficial de [tipos de despliegue](https://docs.replit.com/features/publishing/deployment-types), [monitorización de despliegues](https://docs.replit.com/features/publishing/monitoring-a-deployment), [recuperación de datos](https://docs.replit.com/features/data-and-storage/data-recovery) y [bases de datos de producción](https://docs.replit.com/features/data-and-storage/development-and-production). Confirmar explícitamente backup, retención y PITR en el plan/entorno; no asumirlo.

## Señales, SLO y respuesta

`/api/healthz` es liveness sin base de datos. `/api/readyz` hace `SELECT 1` y devuelve sólo 200/503 genérico. `/api/metrics` usa exposición Prometheus local. No publica IDs, URLs, prompts, contenido fuente, cookies ni datos de negocio. Las etiquetas HTTP están acotadas a método, ruta agrupada y clase de estado; las de worker a tipo/resultado.

Alertar sobre no-readiness, 5xx, latencia HTTP, fallos/ticks del worker, pérdida de lease, trabajos recuperados, líder ausente y profundidad de cola cuando se instrumente una lectura segura. Objetivos iniciales a validar con carga real: disponibilidad mensual API 99.9%, p95 de rutas no pesadas <500 ms y recuperación del worker <5 min. Establecer presupuesto de error y guardias antes de comprometerlos externamente.

RPO objetivo: ≤24 h (o la retención de backup confirmada). RTO objetivo: ≤4 h. Trimestralmente, el operador debe restaurar un backup/PITR en un entorno aislado, verificar esquema/RLS y una muestra de datos, medir RPO/RTO y documentar resultado; nunca restaurar sobre producción sin runbook y aprobación.

## Seguridad, calidad, rendimiento y coste

Los IDs de solicitud se validan con longitud/alfabeto limitado o se generan; se devuelven al cliente y se incorporan a auditoría de mutaciones aceptadas y rechazadas junto con duración/estado, sin cambiar actor. Los errores y auditorías no exponen secretos; fallar al auditar no bloquea la mutación. Mantener redactado de logs y no añadir etiquetas de alta cardinalidad.

Antes de cada cambio: revisión de autorización/RLS, validación/SSRF, límites de payload y rate limit, consultas/indexes, timeout/memoria, y coste de PostgreSQL, egress y AI. La IA sigue siendo salida no confiable: usar evidencia persistida y validación, revisar falsos positivos/negativos y coste por hallazgo mensualmente. Mantener un conjunto de casos aprobados y muestrear resultados humanos para ajustar prompts/reglas sin enviar contenido sensible a observabilidad.

## Gobierno, mantenimiento y hoja de ruta

Las migraciones son aditivas, revisadas, repetibles y probadas contra restore; versionar API/contrato cuando haya incompatibilidad. Conservar auditoría, registrar cambio/aprobación/rollback y no editar historia de producción. Ventana mensual: parches, revisión de alertas/coste/capacidad, prueba de health/readiness y trabajos recuperados. Trimestral: restore drill, revisión de acceso y prueba de escala/fallo de líder.

Meses 1–3: baselines SLO, dashboards/alertas operados y primer restore drill. 4–6: carga/capacidad y política de retención confirmada. 7–9: ejercicio de failover y calibración AI. 10–12: revisión de arquitectura/coste, prueba de DR y objetivos del año siguiente. Cada ítem de plataforma, backup, monitorización, escala o respuesta de guardia requiere ejecución y evidencia del operador.