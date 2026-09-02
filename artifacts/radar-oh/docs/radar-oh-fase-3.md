# RadarOH 2.0 — Fase 3

## Alcance

La Fase 3 añade monitorización automática sin incorporar IA ni alertas externas. Mantiene el radar y los datos migrados en la Fase 2.

## Fuentes y conectores

Cada fuente puede configurarse como:

- Manual.
- RSS / Atom.
- API JSON pública.
- Página web pública.

Las frecuencias soportadas siguen siendo diaria, semanal y mensual. Una fuente automática necesita endpoint y debe habilitarse explícitamente.

## Ejecución y detección

- El scheduler revisa cada minuto qué fuentes están vencidas.
- Cada ejecución registra inicio, fin, disparador, intentos, HTTP, duración, elementos, cambios y error.
- Los fallos temporales se reintentan hasta tres veces con backoff exponencial.
- Los fallos posteriores se reprograman con backoff de 15 minutos hasta 24 horas.
- Cada elemento se normaliza y obtiene un fingerprint SHA-256.
- La primera observación crea un evento `new`; un fingerprint distinto crea `updated`; una observación idéntica no crea evento.
- Toda observación conserva evidencia, payload normalizado, URL, fecha y ejecución de origen.
- Los eventos se relacionan con el competidor configurado o por coincidencia normalizada del nombre.

## Seguridad de red

- Solo se aceptan HTTP y HTTPS sin credenciales embebidas.
- Se bloquean localhost, dominios `.local`, IP privadas, loopback, link-local y rangos reservados.
- El DNS se resuelve y valida antes de cada solicitud.
- Cada redirección vuelve a resolverse y validarse.
- El límite completo de la solicitud es 12 segundos, incluido el cuerpo.
- El cuerpo máximo es 512 KB y se normalizan como máximo 50 elementos por ejecución.
- No existen CAPTCHAs, evasión de bloqueos, autenticación ajena ni scraping agresivo.

## Persistencia y RLS

Las tablas `radar_monitor_runs`, `radar_monitor_evidence` y `radar_change_events` tienen RLS habilitado y forzado mediante `app.workspace_id`.

Los guardados completos de estado usan upserts. No interpretan una fuente o competidor ausente como eliminación, evitando que un snapshot antiguo borre historial. Las eliminaciones son explícitas mediante los endpoints CRUD.

## API

- `GET /api/radar/monitor/status`
- `POST /api/radar/monitor/run`
- `GET /api/radar/monitor/history`

El contrato está definido en OpenAPI y los clientes y validadores se generan con Orval.

## Interfaz

- Fuentes permite elegir conector, endpoint, frecuencia, competidor y estado.
- Monitorización muestra salud, errores, próximas ejecuciones, reintentos, actividad y cambios.
- Historial permite filtrar eventos por competidor.
- Alertas permanece deshabilitado y fuera del alcance de esta fase.

## Verificación

- Typecheck completo del workspace.
- Build del API y build web con `PORT` y `BASE_PATH`.
- Primera ejecución JSON pública: 50 elementos y 50 cambios.
- Segunda ejecución idéntica: 50 elementos y 0 cambios.
- Destino privado: bloqueado antes de conectar.
- Datos temporales de prueba eliminados.