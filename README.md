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
| `usuarios.js` | Usuarios, roles, permisos por módulo y acción, sesiones, recuperación de contraseña y registro de actividad. No depende de Electron. |
| `login.html` | Pantalla de ingreso del programa de escritorio (solo si hay usuarios activados). |
| `integraciones.js`, `api.js` | Claves de API, webhooks firmados con reintentos y API REST v1 (sin dependencia de Electron). |
| `empresas.js`, `monedas.js` | Varias empresas en una instalación (un archivo de datos por empresa) y tipos de cambio. |
| `clave.html` | Pantalla para ingresar la clave de recuperación si los datos cifrados no se pueden abrir. |
| `src-modulos/` | Código fuente de las pantallas nuevas (Configuración, Finanzas, Cobros, Clientes avanzado, Analítica, Migración, Empresas, Integraciones, Sistema, Movilidad). |
| `construir-modulos.js` | Copia `src-modulos/*.js` dentro de `index.html`. **Después de editar un archivo de `src-modulos/` ejecutá `node construir-modulos.js`.** |
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

El instalador queda en `dist\` (por ejemplo `StockProject Setup 1.8.0.exe`).

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

## Usuarios, roles y permisos (versión 1.8)

Es opcional: mientras no se active, el programa funciona como siempre. Se activa en **Usuarios > Activar usuarios** (solo en la PC principal), creando el administrador.
Desde ese momento el programa pide usuario y contraseña al abrirse, y el acceso desde el celular también (la clave única de 6 dígitos deja de usarse).

- **Roles:** Administrador (todo), Gerente (todo salvo gestionar usuarios y acceso remoto), Empleado (vende, carga productos y clientes, pedidos y Escuela) y Consulta (solo ver).
- **Permisos granulares:** cada usuario puede tener permisos de más o de menos que su rol, por módulo y acción (ver / crear / editar / eliminar).
- **Contraseñas:** mínimo 8 caracteres con letras y números; se guardan con scrypt (nunca en claro). Bloqueo de 5 minutos tras 5 intentos fallidos.
- **Sesiones:** hasta 3 por usuario a la vez (al abrir otra se cierra la más antigua), vencen tras 12 horas sin uso y cada usuario puede cerrar las demás desde *Mi cuenta*.
- **Recuperación:** cada usuario puede configurar una pregunta de seguridad; si olvida la contraseña la cambia desde la pantalla de ingreso. Si no la configuró, un administrador restablece la contraseña.
- **Registro de actividad:** `auditoria.jsonl` (junto a los datos). Guarda ingresos, intentos fallidos, cambios de usuarios y contraseñas, respaldos, y las acciones que modifican datos; se consulta en *Usuarios*, con filtro por persona. Nunca guarda contraseñas.
- **Límite conocido:** los datos se guardan como un solo archivo, así que el programa controla el *permiso de guardar* (los usuarios de solo consulta no pueden guardar nada), mientras que el permiso por botón (por ejemplo, quién puede anular ventas) se controla en la interfaz. El registro anota el intento de cada acción, no que haya tenido éxito.
- **Pendiente:** Windows Hello y recuperación por correo (requieren componentes nativos / un servicio de envío).

## Versión 2.0: qué se agregó

**Configuración e inicio.** Encuesta inicial (tipo de comercio, volumen, necesidades, país y moneda) que adapta el menú, el orden de las pantallas, el panel de **Inicio**, las categorías de gastos y los avisos. Incluye recorrido guiado, ayuda contextual (botón **?**), atajos (Alt+1…9 cambian de pantalla, F9 cobra) y recomendaciones según el uso.

**Seguridad y privacidad.** Cifrado opcional AES-256-GCM de datos y respaldos con clave protegida por Windows (DPAPI) y *clave de recuperación*; copias protegidas con contraseña; HTTPS opcional con certificado propio para el acceso remoto; exportar y anonimizar datos de un cliente (RGPD / LOPDGDD). No es una certificación de cumplimiento.

**Finanzas.** Libro de caja y banco, saldos iniciales, resultado, balance simple, flujo de fondos proyectado, cuentas a pagar, conciliación bancaria con extractos CSV, sueldos y alertas (también como notificación del sistema).

**Cobros automáticos.** Cargos recurrentes, recargo por mora, descuento por pronto pago y recordatorios por WhatsApp / correo con link de pago opcional. Los cargos van a la cuenta corriente del cliente y las reglas se pueden ejecutar tantas veces como haga falta sin duplicar. Los comprobantes son internos, **no son facturas fiscales electrónicas**. No hay conexión directa con pasarelas de pago: se pega el enlace de cobro de tu proveedor.

**Clientes avanzado.** Segmentos, valor de vida estimado, puntaje de crédito, límite de crédito que bloquea ventas en cuenta corriente, puntos y niveles, historial de contactos, planes de pago (con agenda .ics) y exportación a contactos (.vcf).

**Analítica.** Filtros por período, cliente, medio de pago y producto; comparación con el período anterior o el mismo del año pasado; gráficos con detalle al tocar; pronóstico con margen de error medido; exportación a CSV y PDF.

**Migración de datos.** Asistente de 5 pasos para importar productos, clientes y saldos desde CSV: plantillas, detección de columnas por nombre, validación masiva con corrección en pantalla, copia previa y **deshacer**. Exporta tus datos a CSV / JSON.

**Empresas y monedas.** Varias empresas con archivos y respaldos separados (usuarios compartidos), datos fiscales por empresa, tipos de cambio automáticos o manuales y reporte consolidado convertido a una moneda.

**Integraciones.** API REST (`/api/v1/docs` en el mismo puerto del acceso remoto) con claves de lectura o escritura, y webhooks firmados (HMAC-SHA256) para venta creada o anulada, stock bajo, clientes, productos y pagos. Catálogo de recetas (Excel, tiendas online, avisos, contabilidad). **No hay conectores nativos de SAP u Oracle:** se integran por la API o por archivos.

**Movilidad y sistema.** Si el celular pierde la conexión o dos dispositivos guardan a la vez, las ventas, cobros, clientes y contactos nuevos no se pierden: se encolan y se reaplican descontando stock sin duplicar. Pantalla de **Sistema** con memoria, tamaño de datos, uso del servidor y una prueba de velocidad con tus propios datos.

### Lo que no se hizo, y por qué
- **Windows Hello / biometría y recuperación de contraseña por correo:** requieren componentes nativos o un servicio de envío de mails.
- **Aplicación web instalable con trabajo sin conexión al *recargar* la página y notificaciones push:** los navegadores exigen HTTPS con certificado de confianza para los *service workers*; con un certificado propio en la red local no funcionan. Sí hay manifiesto (se puede agregar al inicio del celular) y cola sin conexión mientras la página está abierta.
- **Base de datos distribuida, Redis y microservicios:** no aportan en un programa de escritorio. Los datos están en un archivo local con respaldos; la pantalla Sistema mide cuándo conviene cerrar un período.
- **Rediseño visual completo:** se mejoró la navegación, el panel de Inicio y los gráficos, pero las pantallas originales conservan su diseño.
- **Facturación electrónica fiscal (ARCA/AFIP u otras):** no incluida.

### Nuevos datos en el archivo
`cfg` (encuesta, moneda, pantallas, tipos de cambio, programa de puntos), `fin` (movimientos, cuentas a pagar, empleados, extracto bancario), `cargos`, `inter`, `planes`, `rec`, `avisos`, `rules`. Los archivos de versiones anteriores se abren sin cambios.

## Versión 2.1: interfaz más simple, más fluidez y actualizaciones automáticas

**Interfaz.** La barra muestra solo 6 pantallas (las que más se usan según el tipo de negocio) y el resto está en el menú **Más ▾**. Lo avanzado quedó plegado: la ficha del cliente (límite, plan de pagos, contactos, datos personales), el análisis de clientes, los filtros extra de Analítica, el balance, las herramientas de Reportes y la personalización de Configuración. Inicio muestra 5 cuadros y a lo sumo 2 recomendaciones, y los gráficos se adaptan al ancho. Configuración se redujo a 4 secciones (Mi negocio, Seguridad, Datos, Avanzado).

**Fluidez.** Antes cada acción redibujaba todas las pantallas (con 40.000 ventas, 3.000 clientes y 2.000 productos: unos 700 ms por acción). Ahora solo se dibuja la pantalla visible y las listas largas muestran las primeras filas con buscador (Inventario y Clientes tienen buscador nuevo): unos 6 ms por acción y 15 a 45 ms al abrir una pantalla, medido en Chromium real.

**Actualizaciones automáticas.** El programa instalado busca versiones nuevas en las *Releases* de GitHub (`Titiconti/StockProject-Versiones`, el mismo repositorio donde se arma el instalador; configurado en `package.json > build.publish`), las baja en segundo plano y las instala al cerrar (o antes, con el aviso *Actualizar ahora*). Antes de instalar hace un respaldo y no deja actualizar con una venta a medias. Se ve en **Configuración > Avanzado > Sistema y actualizaciones**. Para publicar una versión ver `COMO_PUBLICAR.md` (en la raíz del repositorio).
