# Novedades de StockProject

## 5.3.0 (preparada, sin publicar)
- **Más rubros:** Panadería, Ferretería, Farmacia, Librería, Pet shop, Dietética y Perfumería, cada uno con sus preguntas, categorías y motivos de baja.
- **Panel del celular:** el servidor ahora puede alojarse gratis en Vercel (sin tarjeta ni dominio propio). Cada comercio entra por una dirección del tipo `…vercel.app/c/mi-comercio`.
- Si no hay cambios, la PC avisa al panel cada 5 minutos (antes cada minuto).

## 5.2.0
- **El programa se adapta a tu rubro:** la encuesta inicial ahora pregunta el rubro (Kiosco, Almacén, Verdulería, Carnicería, Cafetería o restaurante, Ropa, Electrónica, Mayorista, Servicios u Otro) y hace preguntas propias de cada uno. Según las respuestas cambia qué se pide al cargar un producto, la unidad por defecto, las categorías sugeridas y los motivos de baja.
- Marca, modelo, garantía, números de serie, variantes y precios por cantidad solo aparecen en los rubros que los usan.
- **Marca propia:** símbolo nuevo (la caja sellada con cinta), tipografía de la marca y animaciones propias: inicio, venta sellada al cobrar, cinta de carga y cambio de pantalla.
- **Interfaz más simple:** Analítica, conciliación bancaria, sueldos, análisis de clientes y puntos, y empresas y monedas quedan ocultas. Se recuperan en Configuración > Mi negocio > Funciones avanzadas.

## 5.1.0 (sin publicar)
- **Nueva imagen:** logo de StockProject, colores nuevos, menú lateral con iconos y título en cada pantalla.
- **Animaciones:** pantalla de inicio animada y transiciones en cada pantalla. Se apagan desde la campana > Preferencias de este equipo.
- **Ver el negocio desde el celular, desde cualquier lugar:** Configuración > Mi negocio > "Ver mi negocio desde el celular". Solo consulta (ventas, estadísticas, stock, caja, saldos). Necesita la dirección y la clave que entrega soporte.
- **Se quitó Integraciones (API REST y webhooks).**
- Corrección: el reporte consolidado de empresas no contaba las ventas hechas después de las 21 h.

## 5.0.0

### Caja
- Apertura con dinero inicial, ingresos y retiros con motivo, y cierre contando el efectivo. Diferencia = contado − esperado.
- Solo el efectivo suma a la caja; tarjeta, transferencia y cuenta corriente no.
- **Para cobrar tiene que haber una caja abierta** (se puede desactivar en Configuración > Mi negocio > Caja).
- Historial de cajas en Más > Caja. Al salir con la caja abierta se pide cerrarla.

### Ventas
- Atajos: F2 buscar, F4 efectivo, F5 tarjeta, F6 transferencia, F7 cuenta corriente, F8 cobrar (pide confirmación).
- Vista en cuadrícula o lista; cada producto muestra su estado con texto.
- El lector no suma dos veces una misma lectura; los productos con todos los lotes vencidos no se venden.
- Venta por peso (precio por kg), por número de serie (con garantía) y con variantes (talle, color…).
- Precios por cantidad y compra mínima por producto.

### Inventario y productos
- "Escuela" ahora es **Baja de Stock**: motivo, justificación obligatoria y responsable. Con motivo Vencimiento se dan de baja los lotes vencidos.
- Opciones por producto: categoría, peso, series, variantes, vencimiento obligatorio, garantía.
- Entrevista por rubro (Configuración > Mi negocio): activa solo lo que tu negocio necesita.

### Clientes y finanzas
- Cobro de deudas en pocos pasos, con "Cobrar todo", resumen y comprobante.
- **Se eliminó el cobro automático** (recargos por mora, pronto pago y cuotas recurrentes). Lo ya generado se conserva.
- El plan de pagos y el límite de crédito ya no se cargan desde la ficha (lo existente sigue vigente).
- Libro mayor con filtros, totales y exportación a PDF.

### Pedidos
- Reposición sugerida con tus ventas reales. Al recibir se carga el costo y la factura del proveedor queda como cuenta a pagar.

### General
- Avisos (campana), historial de actividad (Más > Actividad), preferencias por equipo y tutorial de atajos.
- Los datos se vuelven a controlar al guardar: no se aceptan ventas de lotes vencidos, cierres de caja modificados ni datos inválidos.
- Seguridad: ventana del programa endurecida y dependencia de certificados actualizada.

### Compatibilidad
- Los datos existentes no se modifican. Los productos y ventas anteriores funcionan igual.
- Las instalaciones 2.1.0 buscan actualizaciones en el repositorio anterior (`StockProject-Deposito`): para que reciban esta versión hay que hacer el "puente" descripto en `COMO_PUBLICAR.md`.
