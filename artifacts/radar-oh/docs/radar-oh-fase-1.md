# RadarOH — Fase 1: sincronización y preparación

## Fuente de verdad funcional

La referencia funcional de esta fase es la versión publicada en la rama gh-pages, porque coincide con las capturas y contiene importación/exportación JSON. La rama main conserva la fuente original revisada en docs/legacy-radar-oh-main-App.jsx y no se elimina.

La aplicación se integra en el monorepo como el artefacto @workspace/radar-oh, manteniendo el lenguaje visual y las cinco secciones existentes: Resumen, Fuentes, Competidores, Keywords y Plan 30-60-90.

## Conservación de datos

El JSON original permanece en .local/conversation-workspace/files/attached_assets/ sin modificar. La importación no corrige silenciosamente registros y valida la estructura superior antes de sustituir datos locales.

## Decisiones de sincronización

- Se conserva localStorage para esta fase; todavía no es la persistencia centralizada definitiva.
- Se recuperan los botones de importar/exportar del artefacto desplegado.
- Se mantiene el modelo JSON actual para no romper los datos existentes.
- Se usa el punto de restauración previo a esta preparación como rollback del proyecto.

## Pendientes antes de Fase 2

- Decidir si main debe recibir la versión funcional sincronizada como fuente de desarrollo.
- Extraer progresivamente el código heredado de src/legacy/App.jsx a módulos.
- Definir el contrato API y el modelo PostgreSQL en fases posteriores.
