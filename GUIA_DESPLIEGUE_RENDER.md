# 🚀 Guía: Desplegar en Render

Esta guía te mostrará cómo desplegar tu aplicación en Render para obtener HTTPS automático sin necesidad de ngrok.

## 📋 ¿Por qué Render?

- ✅ **HTTPS automático** - Sin configuración adicional
- ✅ **Tier gratuito** - Perfecto para desarrollo y pruebas
- ✅ **Fácil integración con GitHub** - Despliegue automático
- ✅ **Variables de entorno** - Fácil de configurar
- ✅ **Logs en tiempo real** - Fácil de depurar
- ✅ **Sin tarjeta de crédito** - Para el plan gratuito

## 🔄 Alternativas

Si prefieres otras opciones:
- **Railway** (https://railway.app) - Similar a Render, también gratuito
- **Fly.io** (https://fly.io) - Gratis con HTTPS automático
- **DigitalOcean App Platform** - Tiene tier gratuito limitado
- **Heroku** - Ya no tiene tier gratuito, pero es popular

---

## Paso 1: Preparar el Repositorio en GitHub

### 1.1: Inicializar Git (si no lo has hecho)

```bash
cd apiSincronizarManagerMercadoLibre
git init
```

### 1.2: Crear .gitignore (ya existe, pero verifica)

Asegúrate de que `.gitignore` incluya:
```
node_modules/
.env
.env.local
*.log
```

### 1.3: Hacer commit inicial

```bash
git add .
git commit -m "Initial commit: API Manager Mercado Libre"
```

### 1.4: Crear repositorio en GitHub

1. Ve a: https://github.com/new
2. Crea un nuevo repositorio (público o privado)
3. **NO** inicialices con README, .gitignore o licencia (ya los tienes)
4. Copia la URL del repositorio (ej: `https://github.com/tu-usuario/api-manager-mercado-libre.git`)

### 1.5: Conectar y subir código

```bash
git remote add origin https://github.com/tu-usuario/api-manager-mercado-libre.git
git branch -M main
git push -u origin main
```

---

## Paso 2: Crear Archivo de Configuración para Render

Render necesita saber cómo iniciar tu aplicación. Crea estos archivos:

### 2.1: Crear `render.yaml` (Opcional pero recomendado)

```yaml
services:
  - type: web
    name: api-manager-mercado-libre
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    # Las demás variables de entorno las configurarás en el dashboard
```

### 2.2: Verificar que `package.json` tenga el script `start`

Ya lo tiene:
```json
"scripts": {
  "start": "node server.js"
}
```

---

## Paso 3: Crear Cuenta en Render

1. Ve a: https://render.com
2. Haz clic en **"Get Started for Free"**
3. Regístrate con tu cuenta de GitHub (recomendado) o email
4. Verifica tu email si es necesario

---

## Paso 4: Crear Nuevo Servicio Web

1. En el dashboard de Render, haz clic en **"New +"**
2. Selecciona **"Web Service"**
3. Conecta tu repositorio de GitHub:
   - Si no está conectado, haz clic en **"Connect account"** o **"Configure GitHub"**
   - Autoriza a Render a acceder a tus repositorios
   - Selecciona el repositorio `api-manager-mercado-libre`

---

## Paso 5: Configurar el Servicio

### 5.1: Configuración Básica

- **Name**: `api-manager-mercado-libre` (o el nombre que prefieras)
- **Region**: Elige la más cercana (ej: `Oregon (US West)` para Chile)
- **Branch**: `main` (o la rama que uses)
- **Root Directory**: Deja vacío (o `apiSincronizarManagerMercadoLibre` si el proyecto está en una subcarpeta)

### 5.2: Configuración de Build y Start

- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 5.3: Plan

- Selecciona **"Free"** (gratis)

---

## Paso 6: Configurar Variables de Entorno

En la sección **"Environment Variables"**, agrega todas las variables de tu `.env`:

### Variables del ERP Manager+
```
ERP_BASE_URL=https://axam.managermas.cl/api
ERP_USERNAME=ventasamurai
ERP_PASSWORD=Bayona2502
RUT_EMPRESA=76299574-3
```

### Variables de Mercado Libre
```
MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret
MERCADOLIBRE_ACCESS_TOKEN=tu_access_token
MERCADOLIBRE_REFRESH_TOKEN=tu_refresh_token
MERCADOLIBRE_USER_ID=tu_user_id
MERCADOLIBRE_SITE_ID=MLA
```

### Variables del Servidor
```
NODE_ENV=production
PORT=10000
```

### Variables del Scheduler (Opcional)
```
SYNC_CONCURRENCY=5
SYNC_MAX_RETRIES=3
```

**⚠️ IMPORTANTE**: 
- No incluyas espacios alrededor del `=`
- Los valores sensibles (passwords, tokens) se mantienen privados
- Puedes agregar/editar variables después del despliegue

---

## Paso 7: Desplegar

1. Haz clic en **"Create Web Service"**
2. Render comenzará a construir y desplegar tu aplicación
3. Verás los logs en tiempo real
4. El proceso puede tardar 5-10 minutos la primera vez

---

## Paso 8: Obtener tu URL

Una vez desplegado, verás:

- **URL de tu aplicación**: `https://api-manager-mercado-libre.onrender.com`
  (o el nombre que hayas elegido)

Esta URL ya tiene HTTPS automático y está lista para usar.

---

## Paso 9: Verificar que Funciona

1. Abre en tu navegador:
   ```
   https://tu-app.onrender.com/health
   ```

2. Deberías ver:
   ```json
   {
     "status": "OK",
     "message": "API Middleware funcionando correctamente",
     "timestamp": "..."
   }
   ```

---

## Paso 10: Configurar URLs en Mercado Libre

Ahora que tienes tu URL de producción, configúrala en Mercado Libre:

### 10.1: En el DevCenter de Mercado Libre

1. Ve a tu aplicación en: https://developers.mercadolibre.cl/es_ar/crea-una-aplicacion-en-mercado-libre-es
2. Selecciona tu aplicación

### 10.2: Configurar Redirect URI

1. En **"URIs de redirect"**, agrega:
   ```
   https://tu-app.onrender.com/oauth/callback
   ```
   (Reemplaza `tu-app.onrender.com` con tu URL real)

2. **Guarda los cambios**

### 10.3: Configurar Webhook URL

1. En la sección **"Tópicos"** o **"Notificaciones"**
2. En **"Notificaciones callbacks URL"**, configura:
   ```
   https://tu-app.onrender.com/api/webhooks/mercadolibre
   ```
   (Reemplaza `tu-app.onrender.com` con tu URL real)

3. Asegúrate de tener seleccionado el tópico `orders_v2`

4. **Guarda los cambios**

---

## Paso 11: Obtener Tokens de Acceso (OAuth)

1. **Construye la URL de autorización**:
   ```
   https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=TU_CLIENT_ID&redirect_uri=https://tu-app.onrender.com/oauth/callback
   ```

2. **Abre esta URL en tu navegador**

3. **Inicia sesión y autoriza** la aplicación

4. **Serás redirigido** a tu aplicación con el código

5. **Intercambia el código por tokens** usando el comando que se muestra en la página

6. **Actualiza las variables de entorno en Render**:
   - Ve a tu servicio en Render
   - Ve a la sección **"Environment"**
   - Actualiza `MERCADOLIBRE_ACCESS_TOKEN` y `MERCADOLIBRE_REFRESH_TOKEN`
   - Render reiniciará automáticamente el servicio

---

## 🔄 Despliegues Automáticos

Render se conecta automáticamente con GitHub:

- **Cada vez que hagas push a `main`**, Render desplegará automáticamente
- Puedes ver el estado del despliegue en el dashboard
- Los logs están disponibles en tiempo real

---

## ⚠️ Limitaciones del Plan Gratuito

- **Spinning down**: Si no hay tráfico por 15 minutos, el servicio se "duerme"
- **Primera petición**: Puede tardar 30-60 segundos en "despertar"
- **Ancho de banda**: Limitado pero suficiente para desarrollo/pruebas
- **Tiempo de ejecución**: Limitado pero suficiente para la mayoría de casos

**Solución para evitar el "spinning down"**:
- Usa un servicio de "ping" como UptimeRobot (gratis) para hacer peticiones cada 10 minutos
- O actualiza al plan de pago ($7/mes) que no tiene esta limitación

---

## 📊 Monitoreo y Logs

### Ver Logs en Tiempo Real

1. Ve a tu servicio en Render
2. Haz clic en **"Logs"**
3. Verás todos los logs de tu aplicación en tiempo real

### Métricas

Render también muestra:
- Uso de CPU y memoria
- Tiempo de respuesta
- Número de peticiones

---

## 🔧 Actualizar Variables de Entorno

1. Ve a tu servicio en Render
2. Haz clic en **"Environment"**
3. Agrega, edita o elimina variables
4. Render reiniciará automáticamente el servicio

---

## 🚀 Desplegar Cambios

Cada vez que hagas cambios:

1. **Haz commit y push a GitHub**:
   ```bash
   git add .
   git commit -m "Descripción de los cambios"
   git push origin main
   ```

2. **Render detectará automáticamente** el cambio y desplegará

3. **Verifica el estado** en el dashboard de Render

---

## 🔒 Seguridad

- ✅ HTTPS automático
- ✅ Variables de entorno encriptadas
- ✅ No se exponen credenciales en el código
- ✅ Logs privados (solo tú puedes verlos)

---

## 📝 Checklist Final

- [ ] Repositorio creado en GitHub
- [ ] Código subido a GitHub
- [ ] Cuenta creada en Render
- [ ] Servicio web creado en Render
- [ ] Variables de entorno configuradas
- [ ] Aplicación desplegada exitosamente
- [ ] URL obtenida y verificada (`/health`)
- [ ] Redirect URI configurada en Mercado Libre
- [ ] Webhook URL configurada en Mercado Libre
- [ ] Tokens de acceso obtenidos y configurados

---

## 🆘 Solución de Problemas

### Error: "Build failed"
- Verifica que `package.json` tenga el script `start`
- Verifica que todas las dependencias estén en `package.json`
- Revisa los logs de build en Render

### Error: "Service crashed"
- Revisa los logs en Render
- Verifica que todas las variables de entorno estén configuradas
- Verifica que el puerto sea `10000` (Render usa este puerto automáticamente)

### La aplicación no responde
- Verifica que el servicio esté "running" (no "sleeping")
- Si está "sleeping", haz una petición y espera 30-60 segundos
- Considera usar un servicio de ping para mantenerlo activo

### Variables de entorno no funcionan
- Verifica que no haya espacios alrededor del `=`
- Verifica que los nombres de las variables sean exactos
- Reinicia el servicio manualmente después de cambiar variables

---

## 🎉 ¡Listo!

Si completaste todos los pasos, tu aplicación está desplegada en producción con HTTPS automático.

**Ventajas sobre ngrok**:
- ✅ URL permanente (no cambia)
- ✅ HTTPS automático
- ✅ No necesitas mantener terminales abiertas
- ✅ Despliegue automático desde GitHub
- ✅ Logs y monitoreo integrados

**Próximos pasos**:
1. Configura las URLs en Mercado Libre
2. Obtén los tokens de acceso
3. Prueba la sincronización de stocks
4. Prueba los webhooks con una compra de prueba

