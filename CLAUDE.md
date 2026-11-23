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
- Correr siempre las pruebas con `npm test` (no `node tests/x.test.js` suelto): `tests/run.js` quita las variables `OneDrive*`, porque `store.js` las usa para elegir la carpeta de respaldos. Todo proceso hijo que use `os.homedir()` (p. ej. `servidor-cli.js`) debe recibir un `USERPROFILE`/`HOME` temporal. `tests/aislamiento.test.js` vigila esto.
- **Todo arranque de Electron en pruebas usa `--user-data-dir` temporal + `SP_CARPETA_PRUEBA` temporal** (carpeta vacía). Con `SP_CARPETA_PRUEBA`, `main.js` saca Documentos, home y respaldos de esa carpeta y no busca OneDrive/Dropbox/Google Drive reales. Sin ella, Electron usa las carpetas reales de Windows (ignora `USERPROFILE`) y restaura respaldos reales. `tests/aislamiento.test.js` lo vigila.
- **Una etiqueta `vX.Y.Z` publica una actualización automática para todos los clientes:** solo con aprobación explícita del dueño.
- No guardar secretos en el repositorio ni en este archivo.

## Antes de leer código: Obsidian
El vault `C:\Users\Usuario\OneDrive\StockProject` es el segundo cerebro del proyecto. **Empezá por `00 - Inicio para agentes.md`**: ahí dice qué nota mirar (mapa del código, modelo de datos, reglas, decisiones, panel, estado de versiones). Leé solo los archivos del repo que esas notas indiquen; no recorras el repo entero.
Al terminar una tarea, actualizá la nota que corresponda ("Cómo mantenerlo" en esa nota). Sin secretos ni código copiado.
