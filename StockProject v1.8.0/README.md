# StockProject

Punto de venta e inventario liviano, en español y en pesos argentinos (ARS).
Funciona sin internet. App de escritorio para Windows hecha con Electron.

Incluye: ventas (con vuelto), inventario por **lotes con vencimiento** (se vende primero el que vence antes),
**costo por producto y rentabilidad**, **clientes** con descuento individual, **cuenta corriente** (deuda y pagos) y rentabilidad por cliente,
**Escuela** (desvíos de mercadería: descuentan stock sin ser una venta), **pedidos a proveedores** con control de faltantes,
**lector de códigos de barras** (pistola USB), anulación/corrección de ventas, **ticket con vista previa** (80 mm, 58 mm o A4),
**resumen de ventas en PDF y listado de clientes en PDF**, **acceso remoto desde el celular u otras PC** (mismos datos, con clave) y **respaldos automáticos** en un solo archivo.
No emite factura electrónica (ARCA): los comprobantes dicen "no válido como factura".

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Toda la aplicación (interfaz y lógica) en un solo archivo, sin dependencias externas. |
| `main.js` | Proceso principal de Electron: ventana, guardado de datos, respaldos e impresión. |
| `preload.js` | Puente seguro entre la interfaz y `main.js` (expone `window.sp`). |
| `store.js` | Guardado en archivo con control de versión, respaldos diarios, recuperación y restauración. No depende de Electron (se prueba con Node solo). |
| `servidor.js` | Servidor de acceso remoto (clave, sesiones, API de datos, descarga de copia). No depende de Electron. |
| `servidor-cli.js` | Modo "solo servidor" sin pantalla, para una PC o servidor siempre encendido. |
| `defaults.json` | Valores por defecto que se empaquetan en el instalador (ver abajo). |
| `package.json` | Dependencias y configuración del instalador (electron-builder / NSIS). |
| `.github/workflows/build.yml` | Genera el `.exe` automáticamente en GitHub Actions. |
| `tests/` | Pruebas automáticas (`npm test`). |

`index.html` también funciona abierto en un navegador (guarda en `localStorage`, sin respaldos automáticos ni impresión directa).

## Probar sin instalar

Requiere Node.js 20 o superior.

    npm install
    npm start

## Generar el instalador (.exe)

**En una PC con Windows:**

    npm install
    npm run dist

El instalador queda en `dist\` (por ejemplo `StockProject Setup 1.7.3.exe`).

**Con GitHub (sin instalar nada):** subir esta carpeta a un repositorio; en la pestaña *Actions* ejecutar
"Crear instalador" y descargar el `.exe` desde *Artifacts*.

**Desde Linux:** necesita Wine (para el desinstalador de NSIS):

    npx electron-builder --win --x64 -c.win.signAndEditExecutable=false

El instalador no está firmado digitalmente: Windows mostrará "Windows protegió su PC"
(*Más información* > *Ejecutar de todas formas*). Evitarlo requiere un certificado de firma de código.

## Configuración por cliente: `defaults.json`

Se edita **antes** de generar el instalador, así no hay que configurar cada PC.

| Clave | Efecto |
|---|---|
| `demo` | `true` carga productos de ejemplo (solo para pruebas). Por defecto el inventario arranca vacío. |
| `backupDir` | Carpeta fija de respaldo, ej. `"D:\\Respaldos"`. Vacío = automática. |
| `shop` | `n` nombre, `a` dirección, `t` teléfono: aparecen en el ticket. |
| `imprimirDirecto` | `true` imprime directo en la impresora predeterminada de Windows, sin abrir el cuadro de impresión. |

## Acceso desde el celular u otros dispositivos

El programa instalado abre un servidor propio (puerto 3000, o el siguiente libre). Desde otro dispositivo se abre la dirección que muestra
**Reportes > Acceso desde el celular** (o se escanea el QR) y se ingresa la clave de acceso. Se ve y se modifica **la misma información**
de la PC principal; todo queda en el mismo archivo de datos, que es el que se respalda.

- **Misma red Wi-Fi:** funciona directamente. La PC principal tiene que estar encendida. La primera vez, Windows pregunta por el Firewall: *Permitir* en redes privadas.
- **Desde fuera de la red (otra casa, datos móviles):** no es automático. Opciones: instalar [Tailscale](https://tailscale.com) (gratis) en la PC y en el celular y usar la dirección que da Tailscale;
  o publicar el puerto mediante un túnel seguro (por ejemplo Cloudflare Tunnel). No exponer el puerto directamente a internet sin HTTPS: la clave viaja sin cifrar en HTTP.
- **Clave:** se genera sola (6 dígitos) y se cambia desde la misma tarjeta; al cambiarla se cierra la sesión de todos los dispositivos. Se bloquea 1 minuto tras 5 intentos fallidos.
- **Cambios simultáneos:** cada guardado lleva el número de versión de los datos. Si dos dispositivos guardan al mismo tiempo, el segundo recibe un aviso, se recarga con lo último y repite la acción (nunca se pisan datos).
  Los dispositivos se actualizan solos cada pocos segundos. Sin conexión con la PC principal, el celular no puede operar.
- **Copia en un solo archivo:** *Descargar copia (1 archivo)* en la misma tarjeta (también desde el celular). Es exactamente el archivo de datos: clientes, deudas, desvíos, ventas, productos y pedidos.
- **Servidor sin pantalla:** `node servidor-cli.js --datos ./datos --puerto 3000 --clave 123456` (o `npm run servidor`) para dejarlo en una PC/servidor siempre encendido. Incluye respaldos automáticos.
- En `defaults.json`: `"accesoRemoto": false` lo deja desactivado de fábrica.

## Lector de códigos de barras (pistola)

Funciona con cualquier lector USB que actúe como teclado y termine con **Enter** (configuración de fábrica habitual). El programa distingue un escaneo
(4 o más caracteres a menos de 60 ms entre sí) de alguien que escribe, y borra lo que el lector escribió en el campo enfocado.
Según la pestaña: *Ventas* agrega el producto al carrito; *Productos* completa el campo Código (o abre el producto si ya existe, para sumarle stock);
*Pedidos* y *Escuela* eligen el producto y pasan a la cantidad; en otras pestañas muestra nombre, stock y precio. Suena un pitido de confirmación/error.
El código se guarda en el campo *Código* del producto (se compara el texto exacto).

**Carga inicial del catálogo (instalación desde cero):** en *Productos*, escanear el código de barras → se completa *Código* y el cursor pasa al nombre →
escribir nombre, precio, costo, stock mínimo y cantidad, pasando de campo con **Enter** (en el último campo se guarda; **Ctrl+Enter** guarda de inmediato) →
queda listo para escanear el siguiente. Si el código ya existe, abre ese producto para sumarle stock; no se permiten códigos repetidos entre productos.
Si al escribir el nombre de un producto nuevo aparece una sugerencia parecida, Enter elige esa sugerencia: para crear uno nuevo, seguí con Tab (o tocá otro campo).

## Datos y respaldos

- Los datos se guardan en un archivo JSON dentro de la carpeta de datos del usuario (`%APPDATA%\StockProject\stockproject-data.json`), con escritura atómica.
- Respaldo automático cada hora y al cerrar: una copia por día, se conservan 30 días.
- Carpeta de respaldo automática: OneDrive, Dropbox o Google Drive si existen en la PC; si no, `Documentos\StockProject-Respaldos`.
  Si la carpeta no está disponible, se guarda en Documentos y se avisa.
- Si el archivo de datos se daña o falta, al abrir se recupera la última copia válida (el archivo dañado se conserva aparte).
- Reportes > *Respaldo de datos*: respaldar ahora, cambiar carpeta, restaurar una copia (antes de restaurar se guarda una copia de seguridad de los datos actuales).
- Pensado para **una sola PC por cliente**: dos PCs sobre la misma carpeta de nube se pisarían los datos.

## Modelo de datos (resumen)

    {
      prods:  [{ id, name, code, price, cost, min, lots: [{ id, n (lote), qty, exp (YYYY-MM-DD o "") }] }],
      sales:  [{ id, date, items: [{ id, name, qty, price (final), lp (lista), cost, lots }], total, pay, cid?, cname?, disc?, void? }],
      clients:[{ id, name, phone, disc (%), note }],
      pays:   [{ id, date, cid, amount, method, note }],          // pagos de clientes (cuenta corriente)
      desv:   [{ id, date, note, items: [{ id, name, qty, cost, lots }], void? }],   // Escuela (sin nombre de escuela; `dest` solo existe en desvíos registrados con versiones anteriores)
      orders: [{ id, date, supplier, items: [{ pid, name, qty, rec }], closed, receipts: [] }],
      shop:   { n, a, t, w },   // w: ancho de ticket (72 | 48 | "a4")
      rev,                      // versión de los datos (control de cambios entre dispositivos)
      nid, sid, oid, lid, cid, payid, did   // contadores de ids
    }

El stock de un producto es la suma de sus lotes; el stock vendible excluye los lotes vencidos.
**Rentabilidad** = (venta − costo) / venta, usando el costo que tenía el producto *al momento de vender*. **Deuda de un cliente** = ventas en cuenta corriente (no anuladas) − pagos registrados.

## Pruebas

    npm install
    npm test

Las pruebas simulan el navegador con jsdom y cubren: sugerencias de productos, pedidos y recepción,
carga de productos con lector, costos, clientes, descuentos y deuda, desvíos a escuela, lector de códigos, servidor remoto con clave, dos dispositivos con cambios simultáneos, vista previa e impresión, resumen en PDF, respaldos, poda de copias y recuperación de datos dañados.
No prueban impresoras físicas ni el instalador en Windows.

## Notas para modificar

- **Impresión:** dentro de Electron `window.print()` no funciona; se imprime desde `main.js` (IPC `print`) con una ventana oculta.
- **Resumen en PDF:** `buildReport()` arma el documento; en escritorio `main.js` (IPC `pdf`) pide dónde guardarlo y lo genera con `printToPDF`; en el navegador usa la impresión (Guardar como PDF).
- **Cambios de interfaz:** todo está en `index.html`; las funciones `draw*()` repintan cada pestaña y `save()` persiste.
- **Nueva versión:** subir `version` en `package.json`; instalar encima conserva los datos.
