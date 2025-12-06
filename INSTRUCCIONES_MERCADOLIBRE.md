# 📋 Instrucciones Paso a Paso: Configuración de Mercado Libre

Esta guía te llevará paso a paso para configurar la integración con Mercado Libre desde cero.

## 📌 Resumen de lo que Necesitas

Al finalizar esta guía, tendrás:
- ✅ Una aplicación creada en Mercado Libre
- ✅ Client ID y Client Secret
- ✅ Access Token y Refresh Token
- ✅ Webhook configurado para recibir notificaciones de órdenes
- ✅ Todo listo para sincronizar stocks y procesar órdenes

---

## Paso 1: Acceder al DevCenter de Mercado Libre

1. Ve a: https://developers.mercadolibre.cl/es_ar/crea-una-aplicacion-en-mercado-libre-es
2. Inicia sesión con tu cuenta de Mercado Libre
   - ⚠️ **IMPORTANTE**: Usa la cuenta del propietario de la tienda
   - Recomendamos que la cuenta se cree bajo una entidad legal

---

## Paso 2: Crear una Nueva Aplicación

1. Una vez en el DevCenter, haz clic en **"Crear nueva aplicación"**
2. Completa los campos obligatorios:

### Información Básica de la Aplicación

- **Nombre**: 
  - Debe ser único
  - Ejemplo: "Sincronización Manager Axam"
  
- **Descripción**: 
  - Hasta 150 caracteres
  - Se mostrará cuando la aplicación solicite autorización
  - Ejemplo: "Sincronización de stocks y órdenes entre Manager+ y Mercado Libre"
  
- **Logo**: 
  - Incluye una imagen de tu empresa
  - Dimensiones recomendadas: 512x512px

### URIs de Redirect

1. En **"URIs de redirect"**, agrega la URL de redirección:
   - ⚠️ **OBLIGATORIO**: Debe usar HTTPS
   - Para producción: `https://tu-dominio.com/oauth/callback`
   - Para pruebas locales con ngrok: `https://abc123.ngrok.io/oauth/callback`
   
   **Nota**: Puedes agregar múltiples URIs, una por línea.

2. **Use PKCE (Proof Key for Code Exchange)**: 
   - Opcional pero recomendado
   - Proporciona seguridad adicional

3. **Device Grant**: 
   - Solo si necesitas tokens sin usuario (no es nuestro caso)

### Scopes (Permisos)

Selecciona los permisos necesarios:

- ✅ **Lectura**: Permite leer productos, órdenes, etc.
- ✅ **Escritura**: Permite actualizar stocks, productos, etc.

**Nota**: Para nuestra integración necesitamos ambos.

### Tópicos (Notificaciones)

1. En la sección **"Tópicos"**, selecciona:
   - ✅ **Orders** o **orders_v2**: Para recibir notificaciones de nuevas órdenes

2. En **"Notificaciones callbacks URL"**, configura:
   - URL de producción: `https://tu-dominio.com/api/webhooks/mercadolibre`
   - Para pruebas locales: `https://abc123.ngrok.io/api/webhooks/mercadolibre`
   
   ⚠️ **IMPORTANTE**: Esta URL debe estar configurada y accesible públicamente con HTTPS.

---

## Paso 3: Guardar y Obtener Credenciales

1. Haz clic en **"Guardar"** o **"Crear aplicación"**
2. Serás redirigido a la página de inicio donde verás tu aplicación
3. **Anota las siguientes credenciales** (las necesitarás):

   - **Client ID** (APP_ID)
   - **Client Secret** (SECRET_KEY)
   
   ⚠️ **MUY IMPORTANTE**: 
   - El Client Secret solo se muestra UNA VEZ
   - Cópialo inmediatamente y guárdalo de forma segura
   - Si lo pierdes, tendrás que generar uno nuevo

---

## Paso 4: Configurar ngrok para Pruebas Locales (Opcional pero Recomendado)

Si quieres probar localmente antes de desplegar a producción:

1. **Instala ngrok**: https://ngrok.com/download
2. **Inicia tu servidor local**:
   ```bash
   cd apiSincronizarManagerMercadoLibre
   npm start
   ```
3. **En otra terminal, inicia ngrok**:
   ```bash
   ngrok http 3001
   ```
4. **Copia la URL HTTPS** que ngrok proporciona:
   - Ejemplo: `https://abc123.ngrok.io`
   - Esta URL cambiará cada vez que reinicies ngrok (a menos que uses cuenta de pago)

5. **Actualiza las URLs en Mercado Libre**:
   - Redirect URI: `https://abc123.ngrok.io/oauth/callback`
   - Webhook URL: `https://abc123.ngrok.io/api/webhooks/mercadolibre`

---

## Paso 5: Obtener Tokens de Acceso (OAuth 2.0)

Mercado Libre usa OAuth 2.0. Necesitas obtener un `ACCESS_TOKEN` y `REFRESH_TOKEN`.

### Método 1: Autorización Manual (Recomendado para empezar)

1. **Construye la URL de autorización**:
   ```
   https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=TU_CLIENT_ID&redirect_uri=TU_REDIRECT_URI
   ```
   
   Reemplaza:
   - `TU_CLIENT_ID` con tu Client ID
   - `TU_REDIRECT_URI` con la URI de redirección que configuraste (debe coincidir EXACTAMENTE)
   
   Ejemplo:
   ```
   https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=123456789&redirect_uri=https://abc123.ngrok.io/oauth/callback
   ```

2. **Abre esta URL en tu navegador**

3. **Inicia sesión** con tu cuenta de Mercado Libre

4. **Autoriza la aplicación** haciendo clic en "Autorizar"

5. **Serás redirigido** a tu `redirect_uri` con un código en la URL:
   ```
   https://abc123.ngrok.io/oauth/callback?code=TG-XXXXXXXXXXXXX
   ```

6. **Copia el código** de la URL (la parte después de `code=`)

7. **Intercambia el código por tokens** usando este comando:
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

8. **La respuesta será algo como**:
   ```json
   {
     "access_token": "APP_USR-1234567890-123456-abcdefghijklmnopqrstuvwxyz-123456789",
     "token_type": "Bearer",
     "expires_in": 21600,
     "refresh_token": "TG-9876543210-abcdefghijklmnopqrstuvwxyz-987654321",
     "scope": "offline_access read write",
     "user_id": 123456789
   }
   ```

9. **Guarda estos valores** en tu archivo `.env`:
   ```env
   MERCADOLIBRE_ACCESS_TOKEN=APP_USR-1234567890-123456-abcdefghijklmnopqrstuvwxyz-123456789
   MERCADOLIBRE_REFRESH_TOKEN=TG-9876543210-abcdefghijklmnopqrstuvwxyz-987654321
   MERCADOLIBRE_USER_ID=123456789
   ```

### Método 2: Script de Autorización (Avanzado)

Puedes crear un script Node.js que automatice este proceso. Consulta la documentación de OAuth de Mercado Libre para más detalles.

---

## Paso 6: Configurar Variables de Entorno

Crea o actualiza tu archivo `.env` con todas las credenciales:

```env
# ERP Manager+ (usa las mismas del proyecto Shopify)
ERP_BASE_URL=https://axam.managermas.cl/api
ERP_USERNAME=ventasamurai
ERP_PASSWORD=Bayona2502
RUT_EMPRESA=76299574-3

# Mercado Libre
MERCADOLIBRE_CLIENT_ID=tu_client_id_aqui
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret_aqui
MERCADOLIBRE_ACCESS_TOKEN=tu_access_token_aqui
MERCADOLIBRE_REFRESH_TOKEN=tu_refresh_token_aqui
MERCADOLIBRE_USER_ID=tu_user_id_aqui
MERCADOLIBRE_SITE_ID=MLA

# Servidor
PORT=3001

# Scheduler
SYNC_CONCURRENCY=5
SYNC_MAX_RETRIES=3
```

---

## Paso 7: Probar la Conexión

1. **Verifica la autenticación**:
   ```bash
   npm run test:ml
   ```

   Deberías ver:
   - ✅ Autenticación exitosa con Mercado Libre
   - ✅ Información del usuario
   - ✅ Lista de productos

2. **Si hay errores**, verifica:
   - Que las credenciales estén correctas
   - Que el token no haya expirado (el sistema lo refresca automáticamente)
   - Que tengas conexión a internet

---

## Paso 8: Configurar Webhooks (Suscribirse a Notificaciones)

### Opción A: Desde el DevCenter (Interfaz Web)

1. Ve a tu aplicación en el DevCenter
2. En la sección **"Tópicos"**, asegúrate de tener:
   - ✅ `orders_v2` seleccionado
3. En **"Notificaciones callbacks URL"**, verifica que esté configurada:
   - `https://tu-dominio.com/api/webhooks/mercadolibre`

### Opción B: Desde la API (Programáticamente)

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

---

## Paso 9: Probar con Usuarios de Prueba

Mercado Libre permite crear usuarios de prueba para simular transacciones:

1. **Crear usuario de prueba**:
   ```bash
   curl -X POST \
     https://api.mercadolibre.com/users/test_user \
     -H 'Authorization: Bearer TU_ACCESS_TOKEN' \
     -H 'Content-Type: application/json' \
     -d '{
       "site_id": "MLA"
     }'
   ```

2. **La respuesta incluirá**:
   ```json
   {
     "id": 123456789,
     "nickname": "TEST_USER_123456789",
     "password": "qatest1234",
     "site_status": "active"
   }
   ```

3. **Usa estas credenciales** para:
   - Iniciar sesión en Mercado Libre
   - Realizar compras de prueba
   - Verificar que los webhooks funcionen

---

## Paso 10: Probar la Sincronización de Stocks

1. **Asegúrate de tener productos**:
   - En Manager+ con SKU
   - En Mercado Libre con el mismo SKU en `seller_custom_field`

2. **Ejecuta una sincronización de prueba** (sin hacer cambios):
   ```bash
   npm run sync:dry-run
   ```

3. **Revisa los resultados**:
   - Deberías ver qué productos se actualizarían
   - Verifica que los SKUs coincidan

4. **Si todo está bien, ejecuta la sincronización real**:
   ```bash
   npm run sync:all
   ```

---

## Paso 11: Probar los Webhooks

1. **Asegúrate de que tu servidor esté corriendo**:
   ```bash
   npm start
   ```

2. **Asegúrate de que ngrok esté activo** (si pruebas localmente):
   ```bash
   ngrok http 3001
   ```

3. **Realiza una compra de prueba** en Mercado Libre:
   - Usa un usuario de prueba
   - Compra un producto de tu tienda

4. **Verifica los logs del servidor**:
   - Deberías ver: "📥 Webhook recibido de Mercado Libre"
   - Deberías ver: "🛒 Procesando notificación de orden..."
   - Deberías ver: "✅ Notificación de orden procesada exitosamente"

5. **Verifica en Manager+**:
   - Que se haya creado el cliente
   - Que se haya creado la orden/nota de venta

---

## Paso 12: Configurar Sincronización Automática

Para que la sincronización de stocks se ejecute automáticamente 2 veces al día:

1. **Inicia el scheduler**:
   ```bash
   npm run scheduler
   ```

2. **O usa PM2 para mantenerlo corriendo**:
   ```bash
   npm install -g pm2
   pm2 start syncSchedulerML.js --name ml-sync-scheduler
   pm2 save
   pm2 startup
   ```

El scheduler ejecutará la sincronización:
- A las 12:00 PM (mediodía)
- A las 6:00 PM (18:00)

---

## ✅ Checklist Final

Antes de considerar la integración completa, verifica:

- [ ] Aplicación creada en Mercado Libre
- [ ] Client ID y Client Secret guardados
- [ ] Access Token y Refresh Token obtenidos
- [ ] Variables de entorno configuradas en `.env`
- [ ] Conexión con Mercado Libre probada (`npm run test:ml`)
- [ ] Webhook configurado y accesible
- [ ] Sincronización de stocks probada (dry-run y real)
- [ ] Webhook de órdenes probado (compra de prueba)
- [ ] Cliente y orden creados en Manager+ desde una compra de prueba
- [ ] Scheduler configurado (opcional pero recomendado)

---

## 🆘 Solución de Problemas Comunes

### Error: "Invalid access token"
- **Causa**: El token expiró
- **Solución**: El sistema debería refrescarlo automáticamente. Si no, obtén nuevos tokens mediante OAuth.

### Error: "Producto no encontrado en Mercado Libre"
- **Causa**: SKU no coincide o producto no existe
- **Solución**: Verifica que el SKU en Mercado Libre esté en `seller_custom_field` y coincida exactamente con Manager+

### Error: "Webhook no recibido"
- **Causa**: URL no accesible o mal configurada
- **Solución**: 
  - Verifica que ngrok esté activo (si pruebas localmente)
  - Verifica que la URL en Mercado Libre sea correcta
  - Verifica que el servidor esté corriendo

### Error: "Rate limit alcanzado"
- **Causa**: Demasiadas peticiones muy rápido
- **Solución**: Reduce la concurrencia o espera unos minutos

---

## 📚 Recursos Adicionales

- [Documentación de la API de Mercado Libre](https://developers.mercadolibre.com.co/es_ar/api-docs-es)
- [Documentación de OAuth](https://developers.mercadolibre.com.co/es_ar/autenticacion-y-autorizacion)
- [Documentación de Webhooks](https://developers.mercadolibre.com.co/es_ar/notificaciones)
- [Documentación de Manager+](https://managerapiv1.docs.apiary.io/)

---

## 🎉 ¡Listo!

Si completaste todos los pasos, tu integración con Mercado Libre está configurada y lista para usar.

**Próximos pasos**:
1. Monitorea los logs para asegurarte de que todo funciona correctamente
2. Ajusta la concurrencia según tus necesidades
3. Configura alertas si es necesario
4. Considera desplegar a producción cuando estés seguro de que todo funciona

