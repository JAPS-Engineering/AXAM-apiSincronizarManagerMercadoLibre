/**
 * Script de autenticación y conexión con Mercado Libre
 * 
 * Este archivo permite probar la conexión con Mercado Libre y obtener
 * información de productos para verificar que la autenticación funciona.
 */

require('dotenv').config();
const axios = require('axios');

// Variables de entorno de Mercado Libre
const ML_CLIENT_ID = process.env.MERCADOLIBRE_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.MERCADOLIBRE_CLIENT_SECRET;
const ML_ACCESS_TOKEN = process.env.MERCADOLIBRE_ACCESS_TOKEN;
const ML_REFRESH_TOKEN = process.env.MERCADOLIBRE_REFRESH_TOKEN;
const ML_USER_ID = process.env.MERCADOLIBRE_USER_ID;
const ML_SITE_ID = process.env.MERCADOLIBRE_SITE_ID || 'MLA';

// URL base de la API de Mercado Libre
const ML_API_BASE_URL = 'https://api.mercadolibre.com';

// Variable para almacenar el token de acceso en memoria
let accessToken = null;
let tokenExpirationTime = null;

/**
 * Función para refrescar el token de acceso
 * 
 * @returns {Promise<string>} Nuevo token de acceso
 */
async function refreshAccessToken() {
    try {
        if (!ML_REFRESH_TOKEN) {
            throw new Error('REFRESH_TOKEN no configurado. Necesitas obtenerlo primero mediante OAuth.');
        }

        console.log('🔄 Refrescando token de acceso...');
        
        const response = await axios.post(`${ML_API_BASE_URL}/oauth/token`, {
            grant_type: 'refresh_token',
            client_id: ML_CLIENT_ID,
            client_secret: ML_CLIENT_SECRET,
            refresh_token: ML_REFRESH_TOKEN
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in || 21600; // 6 horas por defecto
        tokenExpirationTime = Date.now() + (expiresIn * 1000);

        // Si viene un nuevo refresh_token, actualizarlo
        if (response.data.refresh_token) {
            console.log('⚠️  Nuevo REFRESH_TOKEN recibido. Actualiza tu archivo .env');
        }

        console.log('✅ Token refrescado exitosamente');
        return accessToken;
        
    } catch (error) {
        console.error('❌ Error al refrescar token:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
            if (error.response.status === 400 || error.response.status === 401) {
                console.error('\n   💡 El REFRESH_TOKEN puede haber expirado o ser inválido.');
                console.error('   Necesitas obtener nuevos tokens mediante el flujo OAuth.');
                console.error('   Consulta el README.md para más información.\n');
            }
        } else {
            console.error(`   Error: ${error.message}`);
        }
        throw new Error('Error al refrescar token: ' + (error.response?.data?.error_description || error.message));
    }
}

/**
 * Función para obtener el token de acceso válido
 * 
 * @returns {Promise<string>} Token de acceso válido
 */
async function getAccessToken() {
    // Si hay un token en memoria y no ha expirado, usarlo
    if (accessToken && tokenExpirationTime && Date.now() < tokenExpirationTime) {
        return accessToken;
    }

    // Si hay un token configurado en .env, usarlo primero
    if (ML_ACCESS_TOKEN && !accessToken) {
        accessToken = ML_ACCESS_TOKEN;
        // Asumir que expira en 6 horas si no tenemos información
        tokenExpirationTime = Date.now() + (6 * 60 * 60 * 1000);
        return accessToken;
    }

    // Si hay refresh_token, intentar refrescar
    if (ML_REFRESH_TOKEN) {
        return await refreshAccessToken();
    }

    throw new Error('No hay token de acceso disponible. Necesitas configurar MERCADOLIBRE_ACCESS_TOKEN o realizar el flujo OAuth.');
}

/**
 * Función para verificar la autenticación con Mercado Libre
 * 
 * @returns {Promise<Object>} Información del usuario
 */
async function verifyMercadoLibreAuth() {
    try {
        console.log('🔐 Verificando autenticación con Mercado Libre...');
        
        let token = await getAccessToken();
        
        let response;
        try {
            response = await axios.get(`${ML_API_BASE_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            // Si es un error 401, intentar refrescar el token automáticamente
            if (error.response?.status === 401 && ML_REFRESH_TOKEN) {
                console.log('   ⚠️  Token expirado. Refrescando automáticamente...');
                try {
                    token = await refreshAccessToken();
                    // Reintentar la petición con el nuevo token
                    response = await axios.get(`${ML_API_BASE_URL}/users/me`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                } catch (refreshError) {
                    console.error('\n❌ No se pudo refrescar el token automáticamente:');
                    if (refreshError.response) {
                        console.error(`   Status: ${refreshError.response.status}`);
                        console.error(`   Mensaje: ${JSON.stringify(refreshError.response.data, null, 2)}`);
                    } else {
                        console.error(`   Error: ${refreshError.message}`);
                    }
                    console.error('\n   💡 El REFRESH_TOKEN puede haber expirado o ser inválido.');
                    console.error('   Necesitas obtener nuevos tokens mediante el flujo OAuth.');
                    console.error('   Consulta el README.md para obtener nuevos tokens.\n');
                    throw refreshError;
                }
            } else {
                throw error;
            }
        }

        console.log('✅ Autenticación exitosa con Mercado Libre');
        console.log(`👤 Usuario: ${response.data.nickname}`);
        console.log(`🆔 ID: ${response.data.id}`);
        console.log(`📧 Email: ${response.data.email || 'No disponible'}`);
        
        return response.data;
        
    } catch (error) {
        // Solo mostrar mensajes de error si no fue un error de refresh (ya se mostró arriba)
        if (!error.response || error.response.status !== 401 || !ML_REFRESH_TOKEN) {
            console.error('❌ Error en la autenticación con Mercado Libre:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
                if (error.response.status === 401) {
                    console.error('\n   💡 Posibles causas:');
                    console.error('   1. El ACCESS_TOKEN ha expirado (válido por 6 horas)');
                    console.error('   2. El REFRESH_TOKEN ha expirado o es inválido');
                    console.error('   3. Las credenciales CLIENT_ID o CLIENT_SECRET son incorrectas');
                    console.error('\n   💡 Solución:');
                    console.error('   - Verifica que MERCADOLIBRE_REFRESH_TOKEN esté configurado en .env');
                    console.error('   - Si el REFRESH_TOKEN expiró, obtén nuevos tokens mediante OAuth');
                    console.error('   - Consulta el README.md para obtener nuevos tokens\n');
                }
            } else {
                console.error(`   Error: ${error.message}`);
            }
        }
        throw new Error('Error al autenticarse con Mercado Libre: ' + (error.response?.data?.message || error.message));
    }
}

/**
 * Función para obtener productos de Mercado Libre
 * 
 * @param {number} limit - Número máximo de productos a obtener (por defecto 10)
 * @returns {Promise<Array>} Lista de productos
 */
async function getMercadoLibreProducts(limit = 10) {
    try {
        console.log(`📦 Obteniendo productos de Mercado Libre (límite: ${limit})...`);
        
        const token = await getAccessToken();
        const userId = ML_USER_ID || (await verifyMercadoLibreAuth()).id;
        
        const response = await axios.get(`${ML_API_BASE_URL}/users/${userId}/items/search`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            params: {
                status: 'active',
                limit: limit
            }
        });

        const itemIds = response.data.results || [];
        console.log(`✅ Se encontraron ${itemIds.length} productos activos`);
        
        if (itemIds.length === 0) {
            return [];
        }

        // Obtener detalles de los productos
        const products = [];
        for (let i = 0; i < Math.min(itemIds.length, limit); i++) {
            try {
                const itemResponse = await axios.get(`${ML_API_BASE_URL}/items/${itemIds[i]}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const item = itemResponse.data;
                products.push({
                    id: item.id,
                    title: item.title,
                    sku: item.seller_custom_field || item.id,
                    available_quantity: item.available_quantity,
                    price: item.price,
                    status: item.status,
                    permalink: item.permalink
                });
            } catch (error) {
                console.warn(`⚠️  Error al obtener detalles del producto ${itemIds[i]}:`, error.message);
            }
        }
        
        // Mostrar información de cada producto
        products.forEach((product, index) => {
            console.log(`\n   Producto ${index + 1}:`);
            console.log(`   - ID: ${product.id}`);
            console.log(`   - Título: ${product.title}`);
            console.log(`   - SKU: ${product.sku}`);
            console.log(`   - Stock: ${product.available_quantity}`);
            console.log(`   - Precio: $${product.price}`);
            console.log(`   - Estado: ${product.status}`);
        });
        
        return products;
        
    } catch (error) {
        console.error('❌ Error al obtener productos de Mercado Libre:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Función para obtener un producto específico por SKU
 * 
 * @param {string} sku - Código SKU del producto
 * @returns {Promise<Object>} Producto encontrado
 */
async function getMercadoLibreProductBySKU(sku) {
    try {
        console.log(`🔍 Buscando producto con SKU: ${sku}...`);
        
        const token = await getAccessToken();
        const userId = ML_USER_ID || (await verifyMercadoLibreAuth()).id;
        
        // Buscar productos del usuario
        const searchResponse = await axios.get(`${ML_API_BASE_URL}/users/${userId}/items/search`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            params: {
                status: 'active'
            }
        });

        const itemIds = searchResponse.data.results || [];
        
        // Buscar el producto por SKU
        for (const itemId of itemIds) {
            try {
                const itemResponse = await axios.get(`${ML_API_BASE_URL}/items/${itemId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const item = itemResponse.data;
                const itemSku = item.seller_custom_field || item.id;
                
                if (itemSku === sku) {
                    console.log(`✅ Producto encontrado:`);
                    console.log(`   - ID: ${item.id}`);
                    console.log(`   - Título: ${item.title}`);
                    console.log(`   - SKU: ${itemSku}`);
                    console.log(`   - Stock: ${item.available_quantity}`);
                    
                    return {
                        id: item.id,
                        title: item.title,
                        sku: itemSku,
                        available_quantity: item.available_quantity,
                        price: item.price,
                        status: item.status
                    };
                }
            } catch (error) {
                // Continuar con el siguiente producto
                continue;
            }
        }
        
        console.log(`⚠️  No se encontró ningún producto con SKU: ${sku}`);
        return null;
        
    } catch (error) {
        console.error('❌ Error al buscar producto por SKU:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Función para actualizar el stock de un producto en Mercado Libre
 * 
 * @param {string} itemId - ID del producto en Mercado Libre
 * @param {number} quantity - Nueva cantidad de stock
 * @returns {Promise<Object>} Respuesta de la actualización
 */
async function updateMercadoLibreStock(itemId, quantity) {
    try {
        console.log(`📝 Actualizando stock del producto ${itemId} a ${quantity}...`);
        
        const token = await getAccessToken();
        
        const response = await axios.put(
            `${ML_API_BASE_URL}/items/${itemId}`,
            {
                available_quantity: quantity
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Stock actualizado exitosamente`);
        console.log(`   - Cantidad anterior: ${response.data.available_quantity || 'N/A'}`);
        console.log(`   - Cantidad nueva: ${quantity}`);
        
        return response.data;
        
    } catch (error) {
        console.error('❌ Error al actualizar stock:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(`   Error: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Función principal para ejecutar las pruebas
 */
async function main() {
    console.log('🚀 Iniciando pruebas de conexión con Mercado Libre\n');
    console.log('='.repeat(60));
    
    // Verificar que las variables de entorno estén configuradas
    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
        console.error('❌ Error: Faltan variables de entorno');
        console.error('   Por favor, configura en tu archivo .env:');
        console.error('   - MERCADOLIBRE_CLIENT_ID=tu_client_id');
        console.error('   - MERCADOLIBRE_CLIENT_SECRET=tu_client_secret');
        console.error('   - MERCADOLIBRE_ACCESS_TOKEN=tu_access_token (opcional si tienes refresh_token)');
        console.error('   - MERCADOLIBRE_REFRESH_TOKEN=tu_refresh_token');
        process.exit(1);
    }
    
    try {
        // 1. Verificar autenticación
        console.log('\n📋 Paso 1: Verificar autenticación\n');
        await verifyMercadoLibreAuth();
        
        // 2. Obtener algunos productos
        console.log('\n\n📋 Paso 2: Obtener productos\n');
        await getMercadoLibreProducts(5);
        
        console.log('\n\n' + '='.repeat(60));
        console.log('✅ Todas las pruebas completadas exitosamente');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n\n' + '='.repeat(60));
        console.error('❌ Error durante las pruebas');
        console.error('='.repeat(60));
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main();
}

// Exportar funciones para uso en otros módulos
module.exports = {
    verifyMercadoLibreAuth,
    getMercadoLibreProducts,
    getMercadoLibreProductBySKU,
    updateMercadoLibreStock,
    getAccessToken,
    refreshAccessToken,
    ML_API_BASE_URL
};

