# CLAUDE.md — StockProject

## Stack real
Electron 33 + Node.js. Interfaz en `index.html` (HTML/JS sin framework). Los módulos nuevos viven en `src-modulos/` y se copian dentro de `index.html` con `node construir-modulos.js`. Datos en JSON local (`store.js`). Pruebas con jsdom en `tests/`.

## Comandos
- Instalar: `npm ci`
- Pruebas: `npm test` (deben pasar todas antes de publicar)
- Después de editar `src-modulos/*.js`: `node construir-modulos.js` (la prueba `estructura.test.js` falla si se olvida)
- Instalador local: `npm run dist`

## Reglas
- Seguir las skills `safe-code-change`, `test-and-verify` y `github-publish-tested`.
- Nunca usar la carpeta de datos real de un negocio para probar.
- **Una etiqueta `vX.Y.Z` publica una actualización automática para todos los clientes:** solo con aprobación explícita del dueño.
- No guardar secretos en el repositorio ni en este archivo.

## Documentación
Vault de Obsidian `OneDrive\StockProject`: `Ingeniería, Git y servidores/StockProject - contexto técnico.md`.
