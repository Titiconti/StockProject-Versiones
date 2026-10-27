# Cómo publicar una versión nueva de StockProject

Cuando publicás una versión en GitHub, **todos los programas instalados la descargan solos** y la instalan al cerrar.

## Una sola vez (para esta versión 2.1.0)
Quienes tienen instalada la 2.0.0 o una anterior **no tienen todavía el actualizador**: tienen que instalar a mano la 2.1.0 una vez. De ahí en adelante se actualizan solos.

## Pasos para cada versión

### 1. Subir los archivos
1. Descomprimí el ZIP.
2. En https://github.com/Titiconti/StockProject-Deposito tocá **Add file > Upload files**.
3. Arrastrá **todo el contenido** del ZIP: la carpeta `StockProject v2.1.0`, la carpeta `.github` y este archivo. Si tu explorador no te deja arrastrar `.github`, hacé esto: **Add file > Create new file**, escribí como nombre `.github/workflows/publicar.yml` (con las barras) y pegá el contenido del archivo `publicar.yml`.
4. Abajo, tocá **Commit changes**.

### 2. Crear la versión (esto dispara todo)
1. En el repositorio, entrá a **Releases > Draft a new release**.
2. En **Choose a tag** escribí `v2.1.0` y elegí **Create new tag: v2.1.0 on publish**.
3. Título: `StockProject 2.1.0`. Podés escribir qué cambió.
4. Tocá **Publish release**.
5. Entrá a la pestaña **Actions**: vas a ver "Publicar versión" trabajando. Tarda unos 10 minutos. Cuando termina en verde, la release ya tiene el instalador (`StockProject-Setup-2.1.0.exe`) y el archivo `latest.yml`. **Ese archivo es el que usan los programas para actualizarse.**

> La etiqueta tiene que ser igual a la carpeta y a la versión: `v2.1.0` ↔ carpeta `StockProject v2.1.0` ↔ `"version": "2.1.0"` en `package.json`.

## Para la próxima versión (2.2.0, por ejemplo)
1. Copiá la carpeta `StockProject v2.1.0` como `StockProject v2.2.0`.
2. Cambiá los archivos que necesites y poné `"version": "2.2.0"` en su `package.json`.
3. Subila al repositorio y creá la release con la etiqueta `v2.2.0`.

## Plan B: sin Actions (a mano)
Si el flujo automático falla, en la release tocá **Edit** y arrastrá estos tres archivos (vienen aparte del ZIP):
`StockProject-Setup-2.1.0.exe`, `StockProject-Setup-2.1.0.exe.blockmap` y `latest.yml`. Tienen que estar los tres.

## Si algo no funciona
- **La pestaña Actions dice "Workflow permissions"**: en *Settings > Actions > General > Workflow permissions* elegí **Read and write permissions** y guardá. Después, en Actions, abrí la ejecución y tocá **Re-run all jobs**.
- **Aviso de Windows ("SmartScreen") al instalar**: el instalador no está firmado digitalmente. Tocá *Más información > Ejecutar de todos modos*. Para evitarlo hace falta comprar un certificado de firma de código.
- **El programa no encuentra la actualización**: la release no puede ser un borrador (*draft*) ni *pre-release*, y tiene que incluir `latest.yml`.
