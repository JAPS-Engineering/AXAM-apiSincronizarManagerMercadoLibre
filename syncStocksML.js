/**
 * Módulo de sincronización de stocks entre Manager+ y Mercado Libre
 * 
 * Este módulo obtiene los stocks de productos desde Manager+ y los sincroniza
 * con Mercado Libre, actualizando los valores de inventario.
 */

require('dotenv').config();
const axios = require('axios');
const { verifyMercadoLibreAuth, getMercadoLibreProductBySKU, getAccessToken, ML_API_BASE_URL } = require('./mercadoLibreAuth');

// Variables de entorno
const ERP_BASE_URL = process.env.ERP_BASE_URL;
const ERP_USERNAME = process.env.ERP_USERNAME;
const ERP_PASSWORD = process.env.ERP_PASSWORD;
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ML_USER_ID = process.env.MERCADOLIBRE_USER_ID;

// Variable para almacenar el token de autenticación del ERP
let erpAuthToken = null;
let erpTokenExpirationTime = null;

// Caché para productos de Mercado Libre (Mapa SKU -> datos del producto)
let mlProductsCache = null;

/**
 * Autenticarse con el ERP Manager+
 */
async function authenticateWithERP() {
    try {
        const response = await axios.post(`${ERP_BASE_URL}/auth/`, {
            username: ERP_USERNAME,
            password: ERP_PASSWORD
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        erpAuthToken = response.data.auth_token;
        erpTokenExpirationTime = Date.now() + (60 * 60 * 1000); // 1 hora
        
        return erpAuthToken;
    } catch (error) {
        console.error('❌ Error en la autenticación con el ERP:', error.response?.data || error.message);
        throw new Error('Error al autenticarse con el ERP: ' + (error.response?.data?.message || error.message));
    }
}

/**
 * Obtener el token de autenticación del ERP (con caché)
 */
async function getERPAuthToken() {
    if (erpAuthToken && erpTokenExpirationTime && Date.now() < erpTokenExpirationTime) {
        return erpAuthToken;
    }
    return await authenticateWithERP();
}

/**
 * Extraer stock de un producto desde la respuesta del endpoint de productos
 * 
 * Cuando se usa con_stock=S, el stock viene en el campo "stock" (array de arrays)
 * donde cada objeto tiene un campo "saldo" que es el stock real
 * 
 * @param {Object} product - Objeto del producto de Manager+
 * @returns {number} Stock total del producto
 */
function extractStockFromProduct(product) {
    let stock = 0;
    
    if (product.stock && Array.isArray(product.stock) && product.stock.length > 0) {
        // Iterar sobre cada sub-array en el array principal
        product.stock.forEach(subArray => {
            if (Array.isArray(subArray)) {
                // Sumar todos los "saldo" de cada objeto en el sub-array
                subArray.forEach(item => {
                    if (item && typeof item === 'object') {
                        const saldo = item.saldo || 0;
                        stock += parseFloat(saldo) || 0;
                    }
                });
            }
        });
    }
    
    return stock;
}

/**
 * Obtener stock de un producto desde Manager+ por SKU
 * 
 * Usa el endpoint de productos con con_stock=S para obtener el stock en la misma respuesta
 * 
 * @param {string} sku - Código SKU del producto
 * @returns {Promise<Object>} Información del producto con stock
 */
async function getManagerProductBySKU(sku) {
    try {
        const token = await getERPAuthToken();
        
        // Usar el endpoint de productos con con_stock=S para obtener el stock
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}/`;
        
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            },
            params: {
                con_stock: 'S'  // Incluir stock detallado por producto
            }
        });

        const productData = response.data.data || response.data;
        
        if (!productData || (Array.isArray(productData) && productData.length === 0)) {
            return null;
        }

        // Si es un array, tomar el primer elemento
        const product = Array.isArray(productData) ? productData[0] : productData;
        
        // Extraer el stock del campo "stock" (array de arrays con campo "saldo")
        const stock = extractStockFromProduct(product);
        
        return {
            sku: product.codigo_prod || product.cod_producto || product.codigo || sku,
            nombre: product.nombre || product.descripcion || product.descrip || '',
            stock: stock,
            unidad: product.unidadstock || product.unidad || '',
            precio: product.precio || product.precio_unit || 0,
            rawData: product
        };
        
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // Producto no encontrado
        }
        
        // Detectar rate limiting
        if (error.response?.status === 429) {
            throw new Error(`Rate limit alcanzado en Manager+ (429). Reduce la concurrencia.`);
        }
        
        // Detectar errores de servidor (puede ser sobrecarga)
        if (error.response?.status >= 500) {
            throw new Error(`Error del servidor Manager+ (${error.response.status}). Puede estar sobrecargado.`);
        }
        
        console.error(`   ❌ Error al obtener stock de ${sku} de Manager+: ${error.response?.data?.message || error.message}`);
        throw error;
    }
}

/**
 * Resolver el SKU de un producto de Mercado Libre desde los datos disponibles.
 * Priorizamos el campo seller_custom_field y como fallback buscamos el atributo SELLER_SKU.
 * Si no hay SKU confiable, retornamos null para evitar usar el item_id (no es un SKU del ERP).
 *
 * @param {Object} item - Objeto de producto de Mercado Libre
 * @returns {string|null} SKU detectado o null si no existe
 */
function resolveSkuFromMLItem(item = {}) {
    // 1) SKU explícito configurado en Mercado Libre
    if (item.seller_custom_field) {
        return item.seller_custom_field;
    }

    // 2) Buscar atributo SELLER_SKU
    if (Array.isArray(item.attributes)) {
        const skuAttr = item.attributes.find(attr => attr.id === 'SELLER_SKU' || attr.id === 'SELLER_SKU_ID');
        if (skuAttr?.value_name) {
            return skuAttr.value_name;
        }
    }

    // Sin SKU utilizable
    return null;
}

/**
 * Pre-cargar todos los productos de Mercado Libre en un Map para acceso rápido O(1)
 * 
 * @returns {Promise<Map<string, Object>>} Mapa de SKU -> datos del producto
 */
async function loadAllMercadoLibreProducts() {
    if (mlProductsCache) {
        return mlProductsCache;
    }

    try {
        console.log('📦 Pre-cargando productos de Mercado Libre en memoria...');
        const productMap = new Map();
        const itemsWithoutSKU = [];
        
        const token = await getAccessToken();
        const userId = ML_USER_ID || (await verifyMercadoLibreAuth()).id;
        
        let offset = 0;
        const limit = 50; // Máximo permitido por Mercado Libre
        let hasMore = true;

        while (hasMore) {
            const response = await axios.get(`${ML_API_BASE_URL}/users/${userId}/items/search`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    status: 'active',
                    limit: limit,
                    offset: offset
                }
            });

            const itemIds = response.data.results || [];
            
            if (!itemIds || itemIds.length === 0) {
                hasMore = false;
                break;
            }
            
            // Obtener detalles de cada producto
            for (const itemId of itemIds) {
                try {
                    const itemResponse = await axios.get(`${ML_API_BASE_URL}/items/${itemId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const item = itemResponse.data;
                    const sku = resolveSkuFromMLItem(item);

                    if (!sku) {
                        itemsWithoutSKU.push({ id: item.id, title: item.title });
                        continue;
                    }

                    // Si el SKU ya existe, mantener el primero (puede haber duplicados)
                    if (!productMap.has(sku)) {
                        productMap.set(sku, {
                            sku: sku,
                            itemId: item.id,
                            currentStock: item.available_quantity || 0,
                            title: item.title,
                            status: item.status
                        });
                    }
                } catch (error) {
                    // Continuar con el siguiente producto si hay error
                    console.warn(`   ⚠️  Error al obtener detalles del producto ${itemId}:`, error.message);
                    continue;
                }
            }
            
            // Verificar si hay más páginas
            const total = response.data.paging?.total || 0;
            if (offset + itemIds.length >= total || itemIds.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        mlProductsCache = productMap;
        
        console.log(`✅ ${productMap.size} SKUs únicos cargados en memoria`);
        if (itemsWithoutSKU.length > 0) {
            console.warn(`⚠️  ${itemsWithoutSKU.length} publicaciones no tienen SKU configurado (seller_custom_field o atributo SELLER_SKU).`);
            console.warn(`   Estas publicaciones se omiten porque no podemos vincularlas con el ERP.`);
            console.warn(`   Ejemplos: ${itemsWithoutSKU.slice(0, 5).map(i => `${i.id} (${i.title || 'sin título'})`).join(', ')}${itemsWithoutSKU.length > 5 ? '...' : ''}\n`);
        }
        
        return productMap;
        
    } catch (error) {
        console.error('❌ Error al pre-cargar productos de Mercado Libre:', error.message);
        throw error;
    }
}

/**
 * Obtener información de un producto desde Mercado Libre por SKU (usando caché)
 * 
 * @param {string} sku - Código SKU del producto
 * @param {Map} productsMap - Mapa de productos (opcional, se carga automáticamente)
 * @returns {Promise<Object>} Información del producto con stock
 */
async function getMercadoLibreProductStockBySKU(sku, productsMap = null) {
    try {
        // Si no se proporciona el mapa, cargarlo
        if (!productsMap) {
            productsMap = await loadAllMercadoLibreProducts();
        }

        const product = productsMap.get(sku);
        return product || null;
        
    } catch (error) {
        console.error(`❌ Error al obtener producto ${sku} de Mercado Libre:`, error.message);
        throw error;
    }
}

/**
 * Actualizar el stock de un producto en Mercado Libre
 * 
 * @param {string} itemId - ID del item en Mercado Libre
 * @param {number} quantity - Nueva cantidad de stock
 * @returns {Promise<Object>} Respuesta de la actualización
 */
async function updateMercadoLibreStock(itemId, quantity) {
    try {
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

        return response.data;
        
    } catch (error) {
        // Detectar rate limiting de Mercado Libre
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'];
            const message = retryAfter 
                ? `Rate limit de Mercado Libre alcanzado. Espera ${retryAfter} segundos antes de continuar.`
                : `Rate limit de Mercado Libre alcanzado (429). Reduce la concurrencia o espera un momento.`;
            throw new Error(message);
        }
        
        // Detectar errores de servidor
        if (error.response?.status >= 500) {
            throw new Error(`Error del servidor Mercado Libre (${error.response.status}). Puede estar sobrecargado.`);
        }
        
        console.error('❌ Error al actualizar stock en Mercado Libre:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Sincronizar el stock de un producto específico (optimizado con caché)
 * 
 * @param {string} sku - Código SKU del producto
 * @param {Object} options - Opciones de sincronización
 * @param {Map} mlProductsMap - Mapa de productos de Mercado Libre (opcional)
 * @returns {Promise<Object>} Resultado de la sincronización
 */
async function syncProductStock(sku, options = {}, mlProductsMap = null) {
    const { dryRun = false, forceUpdate = false } = options;
    
    try {
        // 1. Obtener stock de Manager+
        let managerProduct;
        try {
            managerProduct = await getManagerProductBySKU(sku);
        } catch (error) {
            return {
                sku,
                success: false,
                error: error.message,
                action: 'error'
            };
        }
        
        if (!managerProduct) {
            return {
                sku,
                success: false,
                error: 'Producto no encontrado en Manager+',
                action: 'skipped'
            };
        }
        
        // 2. Obtener stock de Mercado Libre (usando caché si está disponible)
        const mlProduct = await getMercadoLibreProductStockBySKU(sku, mlProductsMap);
        
        if (!mlProduct) {
            return {
                sku,
                success: false,
                error: 'Producto no encontrado en Mercado Libre',
                action: 'skipped'
            };
        }
        
        // 3. Comparar stocks
        const managerStock = parseInt(managerProduct.stock) || 0;
        const mlStock = mlProduct.currentStock;
        
        if (managerStock === mlStock && !forceUpdate) {
            return {
                sku,
                success: true,
                action: 'no_change',
                managerStock,
                mlStock,
                message: 'Stocks ya están sincronizados'
            };
        }
        
        // 4. Actualizar stock en Mercado Libre
        if (dryRun) {
            return {
                sku,
                success: true,
                action: 'would_update',
                managerStock,
                mlStock,
                newStock: managerStock,
                message: 'Dry run: no se realizaron cambios'
            };
        }
        
        await updateMercadoLibreStock(mlProduct.itemId, managerStock);
        
        return {
            sku,
            success: true,
            action: 'updated',
            managerStock,
            mlStock,
            newStock: managerStock,
            message: 'Stock actualizado exitosamente'
        };
        
    } catch (error) {
        return {
            sku,
            success: false,
            error: error.message,
            action: 'error'
        };
    }
}

/**
 * Procesar un array en chunks con límite de concurrencia
 * 
 * @param {Array} array - Array a procesar
 * @param {Function} processor - Función que procesa cada elemento
 * @param {number} concurrency - Número máximo de operaciones paralelas
 * @returns {Promise<Array>} Resultados del procesamiento
 */
async function processInParallel(array, processor, concurrency = 5) {
    const results = [];
    let rateLimitErrors = 0;
    const MAX_RATE_LIMIT_ERRORS = 5;
    
    for (let i = 0; i < array.length; i += concurrency) {
        const chunk = array.slice(i, i + concurrency);
        
        try {
            const chunkResults = await Promise.all(chunk.map(processor));
            results.push(...chunkResults);
            
            // Contar errores de rate limiting en este chunk
            const chunkRateLimitErrors = chunkResults.filter(r => 
                r.error && (r.error.includes('Rate limit') || r.error.includes('429'))
            ).length;
            
            rateLimitErrors += chunkRateLimitErrors;
            
            // Si hay muchos errores de rate limiting, advertir
            if (rateLimitErrors >= MAX_RATE_LIMIT_ERRORS) {
                console.warn(`\n⚠️  Se detectaron múltiples errores de rate limiting.`);
                console.warn(`   Considera reducir la concurrencia con --concurrency=${Math.max(1, Math.floor(concurrency / 2))}\n`);
            }
            
        } catch (error) {
            // Si es un error de rate limit global, esperar un poco y continuar
            if (error.message && error.message.includes('Rate limit')) {
                console.warn(`\n⚠️  Rate limit detectado. Esperando 2 segundos antes de continuar...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw error;
            }
        }
        
        // Mostrar progreso
        const processed = Math.min(i + concurrency, array.length);
        process.stdout.write(`\r   Procesando: ${processed}/${array.length} productos... \n`);
    }
    
    process.stdout.write('\n');
    return results;
}

/**
 * Sincronizar stocks de múltiples productos (optimizado con procesamiento paralelo)
 * 
 * @param {Array<string>} skus - Array de códigos SKU
 * @param {Object} options - Opciones de sincronización
 * @returns {Promise<Object>} Resumen de la sincronización
 */
async function syncMultipleProducts(skus, options = {}) {
    const results = {
        total: skus.length,
        updated: 0,
        skipped: 0,
        errors: 0,
        noChange: 0,
        details: []
    };
    
    // Validar y limitar concurrencia
    let concurrency = options.concurrency || 5;
    const MAX_RECOMMENDED_CONCURRENCY = 20;
    const ABSOLUTE_MAX_CONCURRENCY = 50;
    
    if (concurrency > ABSOLUTE_MAX_CONCURRENCY) {
        console.warn(`⚠️  Advertencia: Concurrencia de ${concurrency} es muy alta. Limitando a ${ABSOLUTE_MAX_CONCURRENCY}`);
        concurrency = ABSOLUTE_MAX_CONCURRENCY;
    } else if (concurrency > MAX_RECOMMENDED_CONCURRENCY) {
        console.warn(`⚠️  Advertencia: Concurrencia de ${concurrency} es alta. Puede causar rate limiting.`);
        console.warn(`   Recomendado: 5-10 para evitar problemas con las APIs.\n`);
    }
    
    console.log(`\n🚀 Iniciando sincronización optimizada de ${skus.length} SKUs`);
    console.log(`⚡ Concurrencia: ${concurrency} SKUs en paralelo\n`);
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    
    try {
        // Verificar autenticación con Mercado Libre primero
        await verifyMercadoLibreAuth();
        
        // Pre-cargar productos de Mercado Libre en memoria (una sola vez)
        console.log('📦 Pre-cargando datos...');
        const mlProductsMap = await loadAllMercadoLibreProducts();
        
        console.log('\n🔄 Iniciando sincronización paralela...\n');
        
        // Procesar productos en paralelo con límite de concurrencia
        const processedResults = await processInParallel(
            skus,
            async (sku) => {
                try {
                    const result = await syncProductStock(sku, options, mlProductsMap);
                    
                    // Mostrar resultado solo si hay algo relevante
                    if (result.action === 'updated' || result.action === 'would_update') {
                        console.log(`   ✅ ${sku}: ${result.mlStock} → ${result.managerStock}`);
                    } else if (result.action === 'error') {
                        console.log(`   ❌ ${sku}: ${result.error}`);
                    }
                    
                    return result;
                } catch (error) {
                    return {
                        sku,
                        success: false,
                        error: error.message,
                        action: 'error'
                    };
                }
            },
            concurrency
        );
        
        results.details = processedResults;
        
        // Procesar resultados
        results.details.forEach(result => {
            if (result.success) {
                if (result.action === 'updated' || result.action === 'would_update') {
                    results.updated++;
                } else if (result.action === 'no_change') {
                    results.noChange++;
                } else {
                    results.skipped++;
                }
            } else {
                results.errors++;
            }
        });
        
        // Reintentos automáticos
        const failedProducts = results.details.filter(r => 
            !r.success && 
            r.action === 'error' &&
            r.error && 
            !r.error.includes('no encontrado') &&
            !r.error.includes('skipped')
        );
        
        if (failedProducts.length > 0 && !options.dryRun) {
            const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
            const retryDelay = options.retryDelay !== undefined ? options.retryDelay : 2000;
            
            console.log(`\n🔄 Reintentando ${failedProducts.length} productos que fallaron...`);
            console.log(`   Intentos máximos: ${maxRetries}`);
            console.log(`   Retraso entre intentos: ${retryDelay}ms\n`);
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            
            let retryAttempt = 1;
            let remainingFailures = [...failedProducts];
            
            while (remainingFailures.length > 0 && retryAttempt <= maxRetries) {
                console.log(`\n🔄 Intento ${retryAttempt}/${maxRetries} de reintento...`);
                
                const retryConcurrency = Math.max(2, Math.floor(concurrency / 2));
                const failedSkus = remainingFailures.map(r => r.sku);
                
                const retryProcessedResults = await processInParallel(
                    failedSkus,
                    async (sku) => {
                        try {
                            const result = await syncProductStock(sku, options, mlProductsMap);
                            
                            if (result.success) {
                                console.log(`   ✅ Reintento exitoso: ${sku}`);
                            }
                            
                            return result;
                        } catch (error) {
                            return {
                                sku,
                                success: false,
                                error: error.message,
                                action: 'error'
                            };
                        }
                    },
                    retryConcurrency
                );
                
                // Actualizar resultados originales y contadores
                retryProcessedResults.forEach(retryResult => {
                    const originalIndex = results.details.findIndex(r => r.sku === retryResult.sku);
                    if (originalIndex !== -1) {
                        const originalResult = results.details[originalIndex];
                        const wasError = !originalResult.success && originalResult.action === 'error';
                        
                        results.details[originalIndex] = retryResult;
                        
                        if (retryResult.success && wasError) {
                            results.errors--;
                            if (retryResult.action === 'updated' || retryResult.action === 'would_update') {
                                results.updated++;
                            } else if (retryResult.action === 'no_change') {
                                results.noChange++;
                            } else if (retryResult.action === 'skipped') {
                                results.skipped++;
                            }
                        }
                    }
                });
                
                remainingFailures = retryProcessedResults.filter(r => 
                    !r.success && 
                    r.action === 'error' &&
                    r.error && 
                    !r.error.includes('no encontrado') &&
                    !r.error.includes('skipped')
                );
                
                if (remainingFailures.length > 0 && retryAttempt < maxRetries) {
                    console.log(`   ⚠️  ${remainingFailures.length} productos aún fallan. Esperando ${retryDelay}ms antes del próximo intento...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                
                retryAttempt++;
            }
            
            if (remainingFailures.length > 0) {
                console.log(`\n⚠️  Después de ${maxRetries} intentos, ${remainingFailures.length} productos aún fallan:`);
                remainingFailures.forEach(failure => {
                    console.log(`   ❌ ${failure.sku}: ${failure.error}`);
                });
            } else {
                console.log(`\n✅ Todos los productos fallidos fueron actualizados exitosamente después de los reintentos.`);
            }
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 Resumen final de sincronización:');
        console.log(`   ✅ Actualizados: ${results.updated}`);
        console.log(`   ℹ️  Sin cambios: ${results.noChange}`);
        console.log(`   ⏭️  Omitidos: ${results.skipped}`);
        console.log(`   ❌ Errores finales: ${results.errors}`);
        console.log(`   ⏱️  Tiempo total: ${duration}s`);
        console.log(`   ⚡ Velocidad: ${(results.total / duration).toFixed(2)} productos/segundo`);
        console.log('='.repeat(60));
        
        return results;
        
    } catch (error) {
        console.error('\n❌ Error fatal en sincronización:', error.message);
        throw error;
    }
}

/**
 * Obtener todos los SKUs de productos de Mercado Libre y sincronizarlos (optimizado)
 * 
 * @param {Object} options - Opciones de sincronización
 * @returns {Promise<Object>} Resumen de la sincronización
 */
async function syncAllProducts(options = {}) {
    try {
        // Pre-cargar productos de Mercado Libre (esto también extrae los SKUs)
        const mlProductsMap = await loadAllMercadoLibreProducts();
        
        // Extraer SKUs del mapa
        const skus = Array.from(mlProductsMap.keys());

        if (skus.length === 0) {
            throw new Error('No hay publicaciones con SKU configurado en Mercado Libre. Configura seller_custom_field o el atributo SELLER_SKU para cada publicación.');
        }
        
        console.log(`✅ Sincronizando ${skus.length} SKUs únicos\n`);
        
        return await syncMultipleProducts(skus, options);
        
    } catch (error) {
        console.error('❌ Error al obtener productos de Mercado Libre:', error.message);
        throw error;
    }
}

// Exportar funciones
module.exports = {
    syncProductStock,
    syncMultipleProducts,
    syncAllProducts,
    getManagerProductBySKU,
    getMercadoLibreProductStockBySKU
};

// Si se ejecuta directamente, procesar argumentos de línea de comandos
if (require.main === module) {
    const args = process.argv.slice(2);
    
    // Extraer opciones
    const options = {
        dryRun: args.includes('--dry-run'),
        force: args.includes('--force'),
        all: args.includes('--all')
    };
    
    // Extraer concurrencia si se especifica
    const concurrencyArg = args.find(arg => arg.startsWith('--concurrency='));
    if (concurrencyArg) {
        const concurrencyValue = parseInt(concurrencyArg.split('=')[1]);
        if (!isNaN(concurrencyValue) && concurrencyValue > 0) {
            options.concurrency = concurrencyValue;
        }
    }
    
    // Extraer maxRetries si se especifica
    const maxRetriesArg = args.find(arg => arg.startsWith('--max-retries='));
    if (maxRetriesArg) {
        const maxRetriesValue = parseInt(maxRetriesArg.split('=')[1]);
        if (!isNaN(maxRetriesValue) && maxRetriesValue >= 0) {
            options.maxRetries = maxRetriesValue;
        }
    }
    
    // Extraer retryDelay si se especifica
    const retryDelayArg = args.find(arg => arg.startsWith('--retry-delay='));
    if (retryDelayArg) {
        const retryDelayValue = parseInt(retryDelayArg.split('=')[1]);
        if (!isNaN(retryDelayValue) && retryDelayValue > 0) {
            options.retryDelay = retryDelayValue;
        }
    }
    
    // Desactivar reintentos si se especifica --no-retry
    if (args.includes('--no-retry')) {
        options.maxRetries = 0;
    }
    
    // Si no hay argumentos o solo hay opciones, mostrar ayuda
    if (args.length === 0 || (args.length === 1 && args[0].startsWith('--'))) {
        if (!options.all) {
            console.log(`
📦 Sincronización de Stocks Manager+ → Mercado Libre (Optimizado)

Uso:
  node syncStocksML.js [SKU1] [SKU2] ... [SKUn]        - Sincronizar productos específicos
  node syncStocksML.js --all                            - Sincronizar todos los productos
  node syncStocksML.js --all --dry-run                  - Simular sincronización sin cambios

Opciones:
  --dry-run                 Simular sin hacer cambios reales
  --force                   Forzar actualización incluso si los stocks son iguales
  --concurrency=N           Número de productos a procesar en paralelo (default: 5)
  --max-retries=N           Número máximo de reintentos automáticos (default: 3)
  --retry-delay=N           Milisegundos de espera entre reintentos (default: 2000)
  --no-retry                Desactivar reintentos automáticos

Ejemplos:
  node syncStocksML.js --all --dry-run --concurrency=10
  node syncStocksML.js ABC123 DEF456 --concurrency=3
  node syncStocksML.js --all --max-retries=5 --retry-delay=3000
            `);
            process.exit(0);
        }
    }
    
    // Función principal
    async function main() {
        try {
            if (options.all) {
                // Sincronizar todos los productos
                await syncAllProducts(options);
            } else {
                // Sincronizar SKUs específicos
                const skus = args.filter(arg => !arg.startsWith('--'));
                if (skus.length === 0) {
                    console.error('❌ Error: Debes proporcionar al menos un SKU o usar --all');
                    process.exit(1);
                }
                await syncMultipleProducts(skus, options);
            }
        } catch (error) {
            console.error('❌ Error fatal:', error.message);
            process.exit(1);
        }
    }
    
    main();
}

