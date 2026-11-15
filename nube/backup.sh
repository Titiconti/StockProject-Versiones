#!/bin/sh
# Respaldo de los datos de StockProject Nube: un .tar.gz con fecha, y se conservan los últimos 30.
# Uso:  ./backup.sh            (desde la carpeta nube/)
#       DATA_DIR=/ruta/datos DESTINO=/ruta/respaldos ./backup.sh
set -eu
cd "$(dirname "$0")"
DATA_DIR="${DATA_DIR:-./datos-nube}"
DESTINO="${DESTINO:-./respaldos}"
CONSERVAR=30

[ -d "$DATA_DIR" ] || { echo "No existe la carpeta de datos: $DATA_DIR" >&2; exit 1; }
mkdir -p "$DESTINO"
archivo="$DESTINO/nube-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$archivo.tmp" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
mv "$archivo.tmp" "$archivo"
chmod 600 "$archivo"
echo "Respaldo creado: $archivo"

# Borra los más viejos y deja los últimos $CONSERVAR.
ls -1 "$DESTINO"/nube-*.tar.gz | sort -r | tail -n +$((CONSERVAR + 1)) | while read -r viejo; do
  rm -f -- "$viejo"
done
