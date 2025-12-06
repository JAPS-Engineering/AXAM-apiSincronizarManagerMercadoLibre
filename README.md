# API Manager Express - Axam Middleware - Mercado Libre

API REST intermedia (Middleware) para interactuar con el ERP Manager+ de Axam y sincronizar stocks y órdenes con Mercado Libre.

## 🚀 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Configura las variables de entorno:
   - Crea un archivo `.env` en la raíz del proyecto
   - Copia las variables del archivo `.env.example` y completa con tus credenciales

## ⚙️ Variables de Entorno

### ERP Manager+
- `ERP_BASE_URL` - URL base del ERP (ej: https://axam.managermas.cl/api)
- `ERP_USERNAME` - Usuario para autenticación en el ERP
- `ERP_PASSWORD` - Contraseña para autenticación en el ERP
- `RUT_EMPRESA` - RUT de la empresa en el ERP

### Mercado Libre
- `MERCADOLIBRE_CLIENT_ID` - Client ID de tu aplicación en Mercado Libre
- `MERCADOLIBRE_CLIENT_SECRET` - Client Secret de tu aplicación
- `MERCADOLIBRE_ACCESS_TOKEN` - Token de acceso (se obtiene mediante OAuth)
- `MERCADOLIBRE_REFRESH_TOKEN` - Token de refresco (se obtiene mediante OAuth)
- `MERCADOLIBRE_USER_ID` - ID del usuario de Mercado Libre (opcional, se obtiene automáticamente)
- `MERCADOLIBRE_SITE_ID` - ID del sitio (ej: MLA para Argentina, MLC para Chile, etc.)

### Servidor
- `PORT` - Puerto del servidor (default: 3001)
- `WEBHOOK_SECRET` - Secreto para validar webhooks (opcional)

### Scheduler
- `SYNC_CONCURRENCY` - Concurrencia para sincronización automática (default: 5)
- `SYNC_MAX_RETRIES` - Número máximo de reintentos (default: 3)

## 📋 Uso

### Servidor Principal
Inicia el servidor:
```bash
npm start
```

El servidor se iniciará en `http://localhost:3001`

### Probar Conexión con Mercado Libre
Para probar la autenticación y conexión con Mercado Libre:
```bash
npm run test:ml
```

Este script verificará:
- ✅ Autenticación con Mercado Libre
- ✅ Obtención de productos
- ✅ Información de inventario

### Sincronizar Stocks

#### Sincronizar un producto específico:
```bash
node syncStocksML.js ABC123
```

#### Sincronizar múltiples productos:
```bash
node syncStocksML.js ABC123 DEF456 GHI789
```

#### Sincronizar todos los productos:
```bash
npm run sync:all
```

#### Simular sincronización (sin hacer cambios):
```bash
npm run sync:dry-run
```

### 🤖 Sincronización Automática (Scheduler)

El scheduler ejecuta la sincronización automáticamente todos los días a las **12:00 PM** y **6:00 PM** (hora de Santiago de Chile).

#### Iniciar el Scheduler:
```bash
npm run scheduler
```

O directamente:
```bash
node syncSchedulerML.js
```

## 🔌 Endpoints Disponibles

### GET `/health`
Verifica el estado del servidor.

### GET `/api/local/productos/:sku?`
Consulta productos del ERP.

### GET `/api/sync/stocks`
Sincroniza stocks desde Manager+ hacia Mercado Libre.

**Parámetros:**
- `sku` (query): SKU específico a sincronizar
- `all` (query): Sincronizar todos los productos (`all=true`)
- `dryRun` (query): Simular sin hacer cambios reales (`dryRun=true`)

### POST `/api/sync/stocks`
Sincroniza stocks de múltiples productos.

**Body:**
```json
{
  "skus": ["ABC123", "DEF456", "GHI789"],
  "dryRun": false
}
```

### POST `/api/webhooks/mercadolibre`
Endpoint para recibir notificaciones de órdenes de Mercado Libre.

## 🔐 Configuración de Mercado Libre

### Paso 1: Crear una Aplicación en Mercado Libre

1. Accede al [DevCenter de Mercado Libre](https://developers.mercadolibre.cl/es_ar/crea-una-aplicacion-en-mercado-libre-es)
2. Inicia sesión con tu cuenta de Mercado Libre
3. Haz clic en **"Crear nueva aplicación"**
4. Completa los campos obligatorios:
   - **Nombre**: Nombre único para tu aplicación (ej: "Sincronización Manager Axam")
   - **Descripción**: Descripción breve (hasta 150 caracteres)
   - **Logo**: Imagen representativa de tu empresa
5. En **"URIs de redirect"**, agrega la URL de redirección:
   - Debe usar HTTPS (obligatorio)
   - Ejemplo: `https://tu-dominio.com/oauth/callback`
   - Para pruebas locales, puedes usar un servicio como ngrok: `https://abc123.ngrok.io/oauth/callback`
6. **Scopes**: Selecciona los permisos necesarios:
   - **Lectura**: Para leer productos y órdenes
   - **Escritura**: Para actualizar stocks y productos
7. **Tópicos**: Selecciona los tópicos de notificaciones:
   - `orders_v2` - Para recibir notificaciones de órdenes
8. **Notificaciones callbacks URL**: Configura la URL de tu webhook:
   - Ejemplo: `https://tu-dominio.com/api/webhooks/mercadolibre`
   - Para pruebas locales: `https://abc123.ngrok.io/api/webhooks/mercadolibre`
9. Guarda la aplicación

### Paso 2: Obtener Credenciales

Después de crear la aplicación, verás:
- **Client ID** (APP_ID)
- **Client Secret** (SECRET_KEY)

**⚠️ IMPORTANTE**: Guarda estas credenciales de forma segura. El Client Secret solo se muestra una vez.

### Paso 3: Obtener Tokens de Acceso (OAuth 2.0)

Mercado Libre usa OAuth 2.0 para autenticación. Necesitas obtener un `ACCESS_TOKEN` y `REFRESH_TOKEN`.

#### Opción A: Flujo de Autorización Manual (Recomendado para pruebas)

1. Construye la URL de autorización:
```
https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=TU_CLIENT_ID&redirect_uri=TU_REDIRECT_URI
```

Reemplaza:
- `TU_CLIENT_ID` con tu Client ID
- `TU_REDIRECT_URI` con la URI de redirección que configuraste (debe coincidir exactamente)

2. Abre esta URL en tu navegador
3. Inicia sesión con tu cuenta de Mercado Libre
4. Autoriza la aplicación
5. Serás redirigido a tu `redirect_uri` con un código de autorización en la URL:
   ```
   https://tu-dominio.com/oauth/callback?code=TG-XXXXXXXXXXXXX
   ```

6. Intercambia el código por tokens usando este comando (o un script):
```bash
curl -X POST \
  https://api.mercadolibre.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "TU_CLIENT_ID",
    "client_secret": "TU_CLIENT_SECRET",
    "code": "TG-XXXXXXXXXXXXX",
    "redirect_uri": "TU_REDIRECT_URI"
  }'
```

7. La respuesta incluirá:
```json
{
  "access_token": "APP_USR-XXXXXXXXXXXXX",
  "token_type": "Bearer",
  "expires_in": 21600,
  "refresh_token": "TG-YYYYYYYYYYYYY",
  "scope": "offline_access read write",
  "user_id": 123456789
}
```

8. Guarda estos valores en tu archivo `.env`:
```env
MERCADOLIBRE_ACCESS_TOKEN=APP_USR-XXXXXXXXXXXXX
MERCADOLIBRE_REFRESH_TOKEN=TG-YYYYYYYYYYYYY
MERCADOLIBRE_USER_ID=123456789
```

#### Opción B: Script de Autorización (Para desarrollo)

Puedes crear un script simple que automatice este proceso. Consulta la documentación de OAuth de Mercado Libre para más detalles.

### Paso 4: Configurar Webhooks

1. En la configuración de tu aplicación en DevCenter, ve a **"Tópicos"**
2. Asegúrate de tener seleccionado `orders_v2`
3. En **"Notificaciones callbacks URL"**, configura:
   - URL de producción: `https://tu-dominio.com/api/webhooks/mercadolibre`
   - Para pruebas locales, usa ngrok o similar

#### Usar ngrok para pruebas locales:

1. Instala ngrok: https://ngrok.com/
2. Inicia tu servidor local:
   ```bash
   npm start
   ```
3. En otra terminal, ejecuta ngrok:
   ```bash
   ngrok http 3001
   ```
4. Copia la URL HTTPS que ngrok proporciona (ej: `https://abc123.ngrok.io`)
5. Configura esta URL en Mercado Libre:
   - Redirect URI: `https://abc123.ngrok.io/oauth/callback`
   - Webhook URL: `https://abc123.ngrok.io/api/webhooks/mercadolibre`

### Paso 5: Suscribirse a Notificaciones (Programáticamente)

También puedes suscribirte a notificaciones usando la API:

```bash
curl -X POST \
  https://api.mercadolibre.com/users/TU_USER_ID/applications/TU_CLIENT_ID/subscriptions \
  -H 'Authorization: Bearer TU_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "orders_v2",
    "callback_url": "https://tu-dominio.com/api/webhooks/mercadolibre"
  }'
```

## 🧪 Pruebas y Simulación

### Crear Usuario de Prueba

Mercado Libre permite crear usuarios de prueba para simular transacciones sin afectar datos reales:

```bash
curl -X POST \
  https://api.mercadolibre.com/users/test_user \
  -H 'Authorization: Bearer TU_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "site_id": "MLA"
  }'
```

Esto te dará:
- `id`: ID del usuario de prueba
- `nickname`: Nombre de usuario
- `password`: Contraseña

### Probar Sincronización de Stocks

1. Asegúrate de tener productos en Manager+ con SKU
2. Asegúrate de tener productos en Mercado Libre con el mismo SKU en el campo `seller_custom_field`
3. Ejecuta una sincronización de prueba:
   ```bash
   npm run sync:dry-run
   ```
4. Revisa los resultados
5. Si todo está bien, ejecuta la sincronización real:
   ```bash
   npm run sync:all
   ```

### Probar Webhooks de Órdenes

1. Asegúrate de que tu servidor esté corriendo
2. Asegúrate de que ngrok (o tu túnel) esté activo
3. Realiza una compra de prueba en Mercado Libre (puedes usar un usuario de prueba)
4. Verifica los logs del servidor para ver si se recibió la notificación
5. Verifica en Manager+ que se haya creado el cliente y la orden

## 📝 Notas Importantes

### SKU en Mercado Libre

- El SKU debe estar en el campo `seller_custom_field` del producto
- Si no hay `seller_custom_field`, se usará el `id` del producto como SKU
- Asegúrate de que los SKUs coincidan entre Manager+ y Mercado Libre

### Rate Limiting

- Mercado Libre tiene límites de rate limiting
- El sistema maneja automáticamente los reintentos
- Se recomienda usar concurrencia de 5-10 para evitar problemas

### Tokens de Acceso

- Los tokens de acceso expiran después de 6 horas
- El sistema refresca automáticamente los tokens usando el `REFRESH_TOKEN`
- Si el `REFRESH_TOKEN` expira, necesitarás obtener nuevos tokens mediante OAuth

### Webhooks

- Mercado Libre envía notificaciones cuando ocurren eventos
- El servidor responde inmediatamente (200 OK) y procesa la notificación de forma asíncrona
- Asegúrate de que tu endpoint sea accesible públicamente (usa HTTPS)

## 🔒 Seguridad

- **NUNCA** compartas tus credenciales
- **NUNCA** subas el archivo `.env` a repositorios públicos
- El archivo `.env` ya está en `.gitignore`
- Usa HTTPS para todos los endpoints públicos
- Valida las notificaciones de webhooks si es necesario (Mercado Libre puede enviar headers de verificación)

## ❓ Solución de Problemas

### Error: "Invalid access token"
- Verifica que el token no haya expirado
- El sistema debería refrescar automáticamente, pero si falla, obtén nuevos tokens mediante OAuth

### Error: "Producto no encontrado en Mercado Libre"
- Verifica que el SKU coincida exactamente
- Verifica que el producto esté activo en Mercado Libre
- Verifica que el SKU esté en el campo `seller_custom_field`

### Error: "Webhook no recibido"
- Verifica que ngrok (o tu túnel) esté activo
- Verifica que la URL esté configurada correctamente en Mercado Libre
- Verifica que el servidor esté corriendo y accesible

### Error: "Rate limit alcanzado"
- Reduce la concurrencia
- Espera unos minutos antes de reintentar
- El sistema reintenta automáticamente, pero puedes ajustar los parámetros

## 📚 Recursos Adicionales

- [Documentación de la API de Mercado Libre](https://developers.mercadolibre.com.co/es_ar/api-docs-es)
- [Documentación de OAuth de Mercado Libre](https://developers.mercadolibre.com.co/es_ar/autenticacion-y-autorizacion)
- [Documentación de Webhooks de Mercado Libre](https://developers.mercadolibre.com.co/es_ar/notificaciones)
- [Documentación de la API de Manager+](https://managerapiv1.docs.apiary.io/)

## 📦 Tecnologías

- Node.js
- Express.js
- Axios
- Dotenv
- CORS
- node-cron

