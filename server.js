/**
 * API REST Intermedia (Middleware) para interactuar con el ERP Manager+ y Mercado Libre
 * 
 * Este servidor actúa como intermediario, manejando la autenticación,
 * sincronización de stocks y webhooks de órdenes de Mercado Libre.
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { processOrderNotification } = require('./createClientAndOrderML');
const { syncProductStock, syncMultipleProducts, syncAllProducts } = require('./syncStocksML');

// Configuración de Express
const app = express();
// Render usa el puerto de la variable de entorno PORT, o 3001 para desarrollo local
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Permite peticiones desde cualquier origen
app.use(express.json()); // Permite parsear JSON en las peticiones

// Variables de entorno del ERP
const ERP_BASE_URL = process.env.ERP_BASE_URL;
const ERP_USERNAME = process.env.ERP_USERNAME;
const ERP_PASSWORD = process.env.ERP_PASSWORD;
const RUT_EMPRESA = process.env.RUT_EMPRESA;

// Variable para almacenar el token de autenticación en memoria
let authToken = null;
let tokenExpirationTime = null;

/**
 * Función para autenticarse con el ERP Manager+
 */
async function authenticateWithERP() {
    try {
        console.log('🔐 Autenticando con el ERP Manager+...');
        
        const response = await axios.post(`${ERP_BASE_URL}/auth/`, {
            username: ERP_USERNAME,
            password: ERP_PASSWORD
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        authToken = response.data.auth_token;
        tokenExpirationTime = Date.now() + (60 * 60 * 1000); // 1 hora
        
        console.log('✅ Autenticación exitosa');
        return authToken;
        
    } catch (error) {
        console.error('❌ Error en la autenticación:', error.response?.data || error.message);
        throw new Error('Error al autenticarse con el ERP: ' + (error.response?.data?.message || error.message));
    }
}

/**
 * Función para obtener el token de autenticación
 */
async function getAuthToken() {
    if (authToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
        return authToken;
    }
    return await authenticateWithERP();
}

/**
 * Endpoint para consultar productos del ERP
 * 
 * GET /api/local/productos/:sku?
 */
app.get('/api/local/productos/:sku?', async (req, res) => {
    try {
        const codProducto = req.params.sku;
        const token = await getAuthToken();
        
        let url;
        if (codProducto) {
            url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${codProducto}/`;
        } else {
            url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/`;
        }
        
        console.log(`📦 Consultando productos desde: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            }
        });
        
        res.json({
            success: true,
            data: response.data,
            message: codProducto ? `Producto ${codProducto} consultado exitosamente` : 'Lista de productos consultada exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error al consultar productos:', error.response?.data || error.message);
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: error.response?.data || null
        });
    }
});

/**
 * Endpoint para sincronizar stocks entre Manager+ y Mercado Libre
 * 
 * POST /api/sync/stocks
 * GET /api/sync/stocks?sku=ABC123
 * GET /api/sync/stocks?all=true
 */
app.post('/api/sync/stocks', async (req, res) => {
    try {
        const { skus, dryRun = false } = req.body;
        
        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de SKUs en el body'
            });
        }
        
        const results = await syncMultipleProducts(skus, { dryRun });
        
        res.json({
            success: true,
            dryRun,
            results
        });
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/sync/stocks', async (req, res) => {
    try {
        const { sku, all, dryRun } = req.query;
        const isDryRun = dryRun === 'true' || dryRun === true;
        
        if (all === 'true' || all === true) {
            const results = await syncAllProducts({ dryRun: isDryRun });
            res.json({
                success: true,
                dryRun: isDryRun,
                results
            });
        } else if (sku) {
            const result = await syncProductStock(sku, { dryRun: isDryRun });
            res.json({
                success: result.success,
                dryRun: isDryRun,
                result
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Se requiere el parámetro "sku" o "all=true"'
            });
        }
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Endpoint para recibir webhooks de Mercado Libre
 * 
 * POST /api/webhooks/mercadolibre
 * 
 * Mercado Libre enviará notificaciones cuando ocurran eventos como:
 * - Nuevas órdenes
 * - Cambios en órdenes existentes
 */
app.post('/api/webhooks/mercadolibre', async (req, res) => {
    try {
        console.log('📥 Webhook recibido de Mercado Libre');
        console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
        console.log('📋 Body:', JSON.stringify(req.body, null, 2));
        
        // Responder inmediatamente a Mercado Libre (200 OK)
        // para evitar que reintente la notificación
        res.status(200).json({
            success: true,
            message: 'Notificación recibida'
        });
        
        // Procesar la notificación de forma asíncrona
        // (no bloquear la respuesta)
        setImmediate(async () => {
            try {
                const notificationData = req.body;
                
                // Verificar el tipo de notificación
                const topic = notificationData.topic || notificationData.type;
                
                if (topic === 'orders_v2' || topic === 'orders') {
                    // Es una notificación de orden
                    console.log('🛒 Procesando notificación de orden...');
                    await processOrderNotification(notificationData);
                    console.log('✅ Notificación de orden procesada exitosamente');
                } else {
                    console.log(`ℹ️  Tipo de notificación no manejado: ${topic}`);
                }
                
            } catch (error) {
                console.error('❌ Error al procesar notificación:', error.message);
                // Aquí podrías implementar un sistema de reintentos o logging
            }
        });
        
    } catch (error) {
        console.error('❌ Error al procesar webhook:', error.message);
        // Aún así responder 200 para evitar reintentos de Mercado Libre
        res.status(200).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Endpoint para verificar el webhook (GET request de Mercado Libre)
 * 
 * Mercado Libre puede hacer un GET para verificar que el endpoint existe
 */
app.get('/api/webhooks/mercadolibre', (req, res) => {
    res.json({
        success: true,
        message: 'Webhook endpoint activo',
        timestamp: new Date().toISOString()
    });
});

/**
 * Endpoint para el callback de OAuth de Mercado Libre
 * 
 * GET /oauth/callback
 * 
 * Este endpoint recibe el código de autorización después de que el usuario
 * autoriza la aplicación en Mercado Libre
 */
app.get('/oauth/callback', (req, res) => {
    const { code, error } = req.query;
    
    if (error) {
        console.error('❌ Error en autorización de Mercado Libre:', error);
        return res.status(400).send(`
            <html>
                <head><title>Error de Autorización</title></head>
                <body>
                    <h1>❌ Error de Autorización</h1>
                    <p>Error: ${error}</p>
                    <p>Por favor, intenta nuevamente.</p>
                </body>
            </html>
        `);
    }
    
    if (!code) {
        return res.status(400).send(`
            <html>
                <head><title>Error</title></head>
                <body>
                    <h1>❌ Error</h1>
                    <p>No se recibió el código de autorización.</p>
                </body>
            </html>
        `);
    }
    
    console.log('✅ Código de autorización recibido:', code);
    
    // Mostrar página con instrucciones para intercambiar el código por tokens
    res.send(`
        <html>
            <head>
                <title>Autorización Exitosa</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 50px auto;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    h1 { color: #3483fa; }
                    .code-box {
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 4px;
                        border-left: 4px solid #3483fa;
                        margin: 20px 0;
                        font-family: monospace;
                        word-break: break-all;
                    }
                    .instructions {
                        background: #fff3cd;
                        padding: 15px;
                        border-radius: 4px;
                        border-left: 4px solid #ffc107;
                        margin: 20px 0;
                    }
                    .command {
                        background: #000;
                        color: #0f0;
                        padding: 15px;
                        border-radius: 4px;
                        margin: 10px 0;
                        font-family: monospace;
                        overflow-x: auto;
                    }
                    .success { color: #28a745; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Autorización Exitosa</h1>
                    <p class="success">¡Has autorizado la aplicación correctamente!</p>
                    
                    <div class="instructions">
                        <h3>📋 Próximos Pasos:</h3>
                        <p>Ahora necesitas intercambiar este código por tokens de acceso.</p>
                    </div>
                    
                    <h3>🔑 Código de Autorización:</h3>
                    <div class="code-box">
                        ${code}
                    </div>
                    
                    <h3>💻 Comando para Obtener Tokens:</h3>
                    <p>Ejecuta este comando en tu terminal (reemplaza los valores):</p>
                    <div class="command">
curl -X POST \\
  https://api.mercadolibre.com/oauth/token \\
  -H 'Content-Type: application/json' \\
  -d '{
    "grant_type": "authorization_code",
    "client_id": "TU_CLIENT_ID",
    "client_secret": "TU_CLIENT_SECRET",
    "code": "${code}",
    "redirect_uri": "${req.protocol}://${req.get('host')}/oauth/callback"
  }'
                    </div>
                    
                    <div class="instructions">
                        <p><strong>⚠️ Importante:</strong></p>
                        <ul>
                            <li>Reemplaza <code>TU_CLIENT_ID</code> con tu Client ID de Mercado Libre</li>
                            <li>Reemplaza <code>TU_CLIENT_SECRET</code> con tu Client Secret</li>
                            <li>Guarda los tokens que recibas en tu archivo <code>.env</code></li>
                        </ul>
                    </div>
                    
                    <p><strong>📝 Nota:</strong> Puedes cerrar esta ventana después de copiar el código.</p>
                </div>
            </body>
        </html>
    `);
});

/**
 * Endpoint de salud/health check
 * 
 * GET /health
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'API Middleware funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

/**
 * Endpoint de información
 * 
 * GET /
 */
app.get('/', (req, res) => {
    res.json({
        name: 'API Manager Express - Axam Middleware - Mercado Libre',
        version: '1.0.0',
        description: 'API REST intermedia para interactuar con el ERP Manager+ y Mercado Libre',
        endpoints: {
            health: '/health',
            productos: '/api/local/productos/:sku?',
            syncStocks: '/api/sync/stocks',
            webhook: '/api/webhooks/mercadolibre',
            oauthCallback: '/oauth/callback'
        }
    });
});

/**
 * Iniciar el servidor
 */
app.listen(PORT, () => {
    console.log('🚀 Servidor iniciado correctamente');
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌐 URL base: http://localhost:${PORT}`);
    console.log(`📋 Endpoints disponibles:`);
    console.log(`   - GET /health`);
    console.log(`   - GET /api/local/productos/:sku?`);
    console.log(`   - GET /api/sync/stocks?sku=ABC123`);
    console.log(`   - GET /api/sync/stocks?all=true`);
    console.log(`   - POST /api/sync/stocks`);
    console.log(`   - POST /api/webhooks/mercadolibre`);
    console.log(`   - GET /oauth/callback`);
    console.log(`\n💡 Realizando autenticación inicial con el ERP...`);
    
    // Realizar una autenticación inicial al iniciar el servidor
    authenticateWithERP()
        .then(() => {
            console.log('✅ Servidor listo para recibir peticiones\n');
        })
        .catch((error) => {
            console.warn('⚠️  Advertencia: No se pudo autenticar inicialmente. Se intentará al hacer la primera petición.');
            console.warn(`   Error: ${error.message}\n`);
        });
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Error no manejado:', error);
});

