# Cómo publicar una versión nueva de StockProject

Todo pasa en un solo repositorio: **`Titiconti/StockProject-Versiones`**. Ahí está el código, ahí se arma el instalador y ahí lo buscan los programas instalados para actualizarse.

> **Requisito:** el repositorio tiene que ser **público**. Los programas instalados no pueden leer las versiones de un repositorio privado.

## Pasos para cada versión
1. Cambiá `"version"` en `package.json` (por ejemplo, `2.2.0`).
2. Corré `npm test`. Tienen que pasar todas.
3. Hacé commit y subilo a `main` (GitHub Desktop: *Commit* y *Push origin*).
4. En GitHub: **Releases > Draft a new release**, en *Choose a tag* escribí `v2.2.0` y elegí *Create new tag on publish*. Título `StockProject 2.2.0`. Tocá **Publish release**.
5. En la pestaña **Actions** vas a ver "Publicar versión" trabajando (unos 10 minutos). Cuando termina en verde, la release tiene `StockProject-Setup-2.2.0.exe`, su `.blockmap` y `latest.yml`. Desde ese momento los programas instalados se actualizan solos.

> La etiqueta tiene que coincidir con la versión: `v2.2.0` ↔ `"version": "2.2.0"`. Si no coinciden, el flujo se detiene a propósito.

## Qué hace el flujo "Publicar versión"
1. Corre todas las pruebas. **Si una falla, no se publica.**
2. Arma el instalador sin publicarlo y lo verifica (`verificar-dist.js`): instalador, `.blockmap`, `latest.yml`, versión y sha512.
3. Sube los tres archivos a la release. El programa instalado comprueba el sha512 antes de instalar.

Antes de etiquetar, probá a mano: **Actions > Crear instalador > Run workflow**, bajá el instalador, instalalo en una PC de prueba, abrí caja, vendé, cerrá y reabrí.

## Puente para las instalaciones 2.1.0 (una sola vez)
Las 2.1.0 buscan actualizaciones en `Titiconti/StockProject-Deposito`. Para que pasen a la versión nueva, creá ahí una release con la misma etiqueta y subí los mismos tres archivos (`.exe`, `.exe.blockmap`, `latest.yml`). Desde esa versión en adelante ya buscan en `StockProject-Versiones`.

## Firma de código (pendiente, opcional)
El instalador no está firmado: Windows muestra el aviso de SmartScreen. Para quitarlo hace falta un certificado de firma de código pago (OV/EV). Cuando lo tengas, se configura en `package.json > build.win` y con secretos de GitHub (`CSC_LINK`, `CSC_KEY_PASSWORD`); nunca se guarda en el repositorio.

## Plan B: sin Actions
Corré `npm run dist` en tu PC (necesita el *Modo de desarrollador* de Windows activado o una consola de administrador) y después `node verificar-dist.js`. En la release, en la release, tocá **Edit** y arrastrá los tres archivos de `dist\`: el `.exe`, el `.exe.blockmap` y `latest.yml`.

## Si algo no funciona
- **Actions no puede publicar:** en *Settings > Actions > General > Workflow permissions* elegí **Read and write permissions**.
- **El programa no encuentra la actualización:** la release no puede ser borrador ni *pre-release*, tiene que incluir `latest.yml` y el repositorio tiene que ser público.
- **Aviso de Windows (SmartScreen):** el instalador no está firmado. *Más información > Ejecutar de todos modos*.
