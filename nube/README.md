# StockProject Nube

Servidor central para que el dueño de cada comercio vea desde el celular, desde cualquier lugar, las ventas y
estadísticas de su negocio. Es de **solo lectura**: no existe ninguna ruta que modifique datos comerciales.

- Cada PC de comercio (StockProject de escritorio) **envía** por HTTPS saliente una "foto" con sus datos
  (`POST /ingesta`). El servidor nunca se conecta a las PCs: no hace falta abrir puertos en el comercio.
- Cada comercio entra por su propia dirección: `https://<sub>.stockproject.qd.je`, con su clave.
- Node 20 o superior, sin dependencias npm. Los datos se guardan en archivos JSON dentro de `DATA_DIR`.
- Esta carpeta **no** forma parte del instalador de escritorio (no está en `build.files`).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `servidor.js` | El servidor (admin, ingesta, panel, verificación para TLS). |
| `panel.html` | El panel que ve el dueño (un solo archivo, sin librerías externas). |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile` | Despliegue con Docker y Caddy (HTTPS automático). |
| `.env.ejemplo` | Plantilla de configuración. |
| `backup.sh` | Respaldo fechado de los datos (conserva 30). |

## Variables

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto donde escucha. |
| `DATA_DIR` | `./datos-nube` | Carpeta de datos. |
| `DOMAIN_BASE` | — | Dominio base, por ejemplo `stockproject.qd.je`. |
| `ADMIN_TOKEN` | — | **Obligatorio.** Secreto de administración (24 caracteres o más). Sin él, el servidor no arranca. |
| `CONFIAR_PROXY` | — | `1` cuando hay un proxy propio adelante (Caddy): usa su `X-Forwarded-For` para los límites por IP. El `docker-compose.yml` ya lo define. |

## Probarlo en tu computadora

```sh
cd nube
ADMIN_TOKEN=$(openssl rand -hex 32) DOMAIN_BASE=stockproject.qd.je node servidor.js
```

Como en local el `Host` no es del dominio, el comercio se indica con el header `X-Comercio: <sub>`
(por ejemplo con `curl -H "X-Comercio: almacen-lola" http://localhost:8080/`).

## Despliegue en una VM de Oracle Cloud (Always Free, ARM, Ubuntu)

### Requisitos

- Una VM `VM.Standard.A1.Flex` (ARM) con Ubuntu 22.04 o 24.04 y una IP pública **reservada** (para que no cambie).
- Acceso por SSH con el usuario `ubuntu`.
- Poder crear registros DNS del dominio `stockproject.qd.je`.

### 1. DNS

Apuntá a la IP pública de la VM:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `stockproject.qd.je` | IP de la VM |
| A | `*.stockproject.qd.je` | IP de la VM |

Si el proveedor de DNS no permite el comodín `*`, creá un registro A por cada comercio
(`almacen-lola.stockproject.qd.je` → IP de la VM) antes de darlo de alta.

### 2. Abrir los puertos 80 y 443 (en los DOS lugares)

**a) En Oracle Cloud.** Consola → Networking → Virtual Cloud Networks → tu VCN → Security Lists → *Default Security List* →
*Add Ingress Rules*, dos reglas:

- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port `80`
- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port `443`

**b) En la VM.** Las imágenes Ubuntu de Oracle traen iptables cerrado salvo SSH:

```sh
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Si en cambio usás ufw: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`.

El puerto 8080 del servidor **no** se abre: solo lo usa Caddy dentro de la red de Docker.

### 3. Instalar Docker

```sh
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Cerrá la sesión SSH y volvé a entrar para que tome el grupo. Verificá con `docker compose version`.

### 4. Clonar y configurar

```sh
git clone <URL del repositorio> StockProject
cd StockProject/nube
cp .env.ejemplo .env
sed -i "s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=$(openssl rand -hex 32)/" .env
chmod 600 .env
nano .env        # revisá DOMAIN_BASE
mkdir -p datos-nube && sudo chown 1000:1000 datos-nube   # el contenedor corre como usuario no root (uid 1000)
```

Guardá el `ADMIN_TOKEN` en un gestor de contraseñas: es la llave de toda la administración.

### 5. Levantar

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f        # Ctrl+C para salir
```

Probá: `curl https://stockproject.qd.je/salud` debe responder `{"ok":true}`. El primer pedido a cada dominio tarda
unos segundos, porque en ese momento Caddy tramita el certificado.

Para actualizar más adelante: `git pull && docker compose up -d --build`.

## Administración (con curl)

En todos los ejemplos, primero cargá el token en una variable (así no queda escrito en cada comando):

```sh
read -rs ADMIN_TOKEN     # pegá el token y Enter
BASE=https://stockproject.qd.je
```

### Dar de alta un comercio

```sh
curl -sS -X POST "$BASE/admin/comercios" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Almacén Lola","sub":"almacen-lola"}'
```

Respuesta (se muestra **una sola vez**; anotala):

```json
{"id":"store_001","sub":"almacen-lola","url":"https://almacen-lola.stockproject.qd.je","token":"spn_…","clave":"…"}
```

- `token`: token de instalación. Se carga en el StockProject de escritorio de ese comercio para que envíe sus datos.
- `clave`: clave inicial del panel. Se la das al dueño, que entra a la `url` desde el celular.
- El subdominio lleva de 3 a 32 caracteres (minúsculas, números y guiones) y no puede ser `www`, `admin`, `api`, `app`, `panel` ni `mail`.

### Ver los comercios

```sh
curl -sS "$BASE/admin/comercios" -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Revocar

```sh
# Token de instalación nuevo (el anterior deja de servir: por ejemplo, si se cambió o se perdió la PC)
curl -sS -X POST "$BASE/admin/comercios/store_001/token" -H "Authorization: Bearer $ADMIN_TOKEN"

# Clave del panel nueva (cierra todas las sesiones abiertas de ese comercio)
curl -sS -X POST "$BASE/admin/comercios/store_001/clave" -H "Authorization: Bearer $ADMIN_TOKEN"

# Desactivar el comercio: no puede enviar datos ni ingresar al panel (con true se reactiva)
curl -sS -X POST "$BASE/admin/comercios/store_001/estado" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"activo":false}'
```

Al generar un token de instalación nuevo, la numeración de envíos (`seq`) de ese comercio vuelve a empezar.

Para cambiar el `ADMIN_TOKEN`: editá `.env` y corré `docker compose up -d`.

## Envío de datos desde la PC (referencia)

```sh
curl -sS -X POST "$BASE/ingesta" -H "Authorization: Bearer spn_…" -H "Content-Type: application/json" \
  -d '{"seq":1,"foto":{"v":1,"generado":"2026-01-01T12:00:00.000Z","negocio":{"nombre":"Almacén Lola","moneda":"ARS","loc":"es-AR"},"ventas":[]}}'
```

- El comercio se identifica solo por el token. `seq` debe crecer en cada envío; uno repetido o menor se responde
  con `{"ok":true,"repetido":true}` y no se guarda.
- Tamaño máximo: 8 MB. Si pasan más de 120 segundos sin envíos, el panel avisa que los datos pueden no estar al día.

## Respaldos

```sh
cd ~/StockProject/nube
./backup.sh
```

Crea `respaldos/nube-AAAAMMDD-HHMMSS.tar.gz` y conserva los últimos 30. Para hacerlo todos los días a las 3:30:

```sh
( crontab -l 2>/dev/null; echo "30 3 * * * cd $HOME/StockProject/nube && ./backup.sh >> respaldos/backup.log 2>&1" ) | crontab -
```

Los respaldos quedan en la misma VM: copialos también afuera cada tanto (por ejemplo con `scp` a tu computadora).
Contienen los hashes de claves y tokens y las fotos de los comercios: tratalos como información privada.

### Restaurar

```sh
cd ~/StockProject/nube
docker compose stop nube
mv datos-nube datos-nube.anterior
tar -xzf respaldos/nube-AAAAMMDD-HHMMSS.tar.gz
sudo chown -R 1000:1000 datos-nube
docker compose start nube
```

Las fotos se regeneran solas: cada PC vuelve a enviar la suya en el siguiente ciclo. Lo importante del respaldo es
`comercios.json` (altas, claves y tokens). Si se restaura un respaldo viejo y un comercio deja de actualizarse
(porque su `seq` guardado quedó desfasado), generale un token de instalación nuevo.

## Seguridad, en corto

- Tokens y claves se guardan solo como hash (sha256 y scrypt). No se escriben en los registros.
- La sesión del panel es una cookie `HttpOnly`, `SameSite=Strict`, `Secure`, válida solo para el subdominio de ese
  comercio y atada a su id: la sesión de un comercio no sirve en otro.
- La administración solo responde en el dominio base, nunca en el subdominio de un comercio.
- Límites de intentos: 5 claves erróneas cada 10 minutos por IP y comercio; 20 tokens erróneos por minuto por IP.
- `/interno/tls-permitido` lo usa Caddy para decidir si pide un certificado; Caddy no lo expone hacia afuera.

## Pruebas

`npm test` en la raíz del repositorio incluye `tests/nube.test.js`.
