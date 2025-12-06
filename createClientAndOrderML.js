/**
 * Módulo para crear clientes y órdenes en Manager+ desde notificaciones de Mercado Libre
 * 
 * Este módulo procesa las notificaciones de órdenes de Mercado Libre,
 * verifica si el cliente existe en Manager+ y crea la orden de compra/nota de venta.
 */

require('dotenv').config();
const axios = require('axios');
const { format, addDays, subDays } = require('date-fns');

// Variables de entorno
const ERP_BASE_URL = process.env.ERP_BASE_URL;
const ERP_USERNAME = process.env.ERP_USERNAME;
const ERP_PASSWORD = process.env.ERP_PASSWORD;
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ML_API_BASE_URL = 'https://api.mercadolibre.com';
const { getAccessToken } = require('./mercadoLibreAuth');

// Variable para almacenar el token de autenticación del ERP
let erpAuthToken = null;
let erpTokenExpirationTime = null;

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
 * Obtener información completa de una orden de Mercado Libre
 * 
 * @param {string} orderId - ID de la orden en Mercado Libre
 * @returns {Promise<Object>} Información completa de la orden
 */
async function getMercadoLibreOrder(orderId) {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(`${ML_API_BASE_URL}/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
        
    } catch (error) {
        console.error(`❌ Error al obtener orden ${orderId} de Mercado Libre:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Obtener información del comprador de una orden
 * 
 * @param {string} buyerId - ID del comprador en Mercado Libre
 * @returns {Promise<Object>} Información del comprador
 */
async function getMercadoLibreBuyer(buyerId) {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(`${ML_API_BASE_URL}/users/${buyerId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
        
    } catch (error) {
        console.error(`❌ Error al obtener información del comprador ${buyerId}:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Obtener comunas desde Manager+
 */
async function getComunas() {
    try {
        const token = await getERPAuthToken();
        const response = await axios.get(`${ERP_BASE_URL}/tabla-gral/comunas`, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.data || [];
    } catch (error) {
        console.error('❌ Error al obtener comunas:', error.message);
        return [];
    }
}

/**
 * Mapear región de Mercado Libre a código de región de Manager+
 */
function mapRegionToCode(regionName) {
    const regiones = [
        { code: "1", regionCode: "TA", name: "Tarapacá" },
        { code: "2", regionCode: "AN", name: "Antofagasta" },
        { code: "3", regionCode: "AT", name: "Atacama" },
        { code: "4", regionCode: "CO", name: "Coquimbo" },
        { code: "5", regionCode: "VS", name: "Valparaíso" },
        { code: "6", regionCode: "LI", name: "Libertador General Bernardo O'Higgins" },
        { code: "7", regionCode: "ML", name: "Maule" },
        { code: "8", regionCode: "BI", name: "Biobío" },
        { code: "9", regionCode: "AR", name: "Araucanía" },
        { code: "10", regionCode: "LL", name: "Los Lagos" },
        { code: "11", regionCode: "AI", name: "Aysén" },
        { code: "12", regionCode: "MA", name: "Magallanes" },
        { code: "13", regionCode: "RM", name: "Metropolitana" },
        { code: "14", regionCode: "LR", name: "Los Ríos" },
        { code: "15", regionCode: "AP", name: "Arica y Parinacota" },
        { code: "16", regionCode: "NB", name: "Ñuble" }
    ];

    // Buscar por nombre (case insensitive)
    const region = regiones.find(r => 
        r.name.toLowerCase().includes(regionName?.toLowerCase() || '') ||
        regionName?.toLowerCase().includes(r.name.toLowerCase() || '')
    );

    return region ? region.code : "13"; // Default: RM
}

/**
 * Crear cliente en Manager+
 * 
 * @param {Object} orderData - Datos de la orden de Mercado Libre
 * @param {Object} buyerData - Datos del comprador
 * @returns {Promise<Object>} Resultado de la creación
 */
async function createClient(orderData, buyerData) {
    try {
        const token = await getERPAuthToken();
        const comunas = await getComunas();
        
        // Extraer información de la orden
        const shipping = orderData.shipping || {};
        const receiverAddress = shipping.receiver_address || {};
        const address = receiverAddress.address_line || '';
        const city = receiverAddress.city?.name || receiverAddress.city_name || '';
        const state = receiverAddress.state?.name || receiverAddress.state_name || '';
        const zipCode = receiverAddress.zip_code || '';
        
        // Buscar comuna
        const comuna = comunas.find(c => 
            c.name?.toLowerCase() === city?.toLowerCase() ||
            c.name?.toLowerCase() === receiverAddress.city_name?.toLowerCase()
        );
        
        const codComuna = comuna ? comuna.code_ext : ".";
        const codCiudad = mapRegionToCode(state);
        
        // Información del cliente
        const buyerNickname = buyerData.nickname || 'Comprador ML';
        const buyerEmail = buyerData.email || orderData.buyer?.email || '';
        const buyerPhone = shipping.receiver_phone || buyerData.phone?.number || '';
        
        // RUT del cliente (si está disponible en los datos)
        // Mercado Libre no siempre proporciona RUT, usar ID como fallback
        const rutCliente = orderData.buyer?.id?.toString() || buyerData.id?.toString() || `ML-${buyerData.id}`;
        
        const infoCliente = {
            rut_empresa: RUT_EMPRESA,
            rut_cliente: rutCliente,
            razon_social: buyerNickname.toUpperCase().slice(0, 50),
            nom_fantasia: buyerNickname.toUpperCase().slice(0, 50),
            giro: "Persona Natural",
            holding: "",
            area_prod: "",
            clasif: "A5",
            email: buyerEmail,
            emailsii: buyerEmail,
            comentario: `Cliente creado desde Mercado Libre, Ciudad: ${city}`,
            tipo: "C",
            tipo_prov: "N",
            vencimiento: "01",
            plazo_pago: "01",
            cod_vendedor: ERP_USERNAME,
            cod_comis: ERP_USERNAME,
            cod_cobrador: "",
            lista_precio: "18",
            comen_emp: "",
            descrip_dir: "Direccion Mercado Libre",
            direccion: address.slice(0, 70) || city.slice(0, 70),
            cod_comuna: codComuna,
            cod_ciudad: codCiudad,
            atencion: ".",
            emailconta: buyerEmail,
            telefono: buyerPhone || ".",
            fax: "",
            cta_banco: "",
            cta_tipo: "",
            cta_corr: "",
            id_ext: orderData.buyer?.id?.toString() || "",
            texto1: "",
            texto2: "",
            caract1: "",
            caract2: ""
        };

        const response = await axios.post(
            `${ERP_BASE_URL}/import/create-client/?sobreescribir=S`,
            infoCliente,
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Cliente creado/actualizado exitosamente en el ERP:', response.data.mensaje);
        return { success: true, data: response.data, cliente: infoCliente };
        
    } catch (error) {
        console.error('❌ Error al crear el cliente en el ERP:', error.response?.data?.mensaje || error.message);
        throw error;
    }
}

/**
 * Obtener el último folio de Nota de Venta
 */
async function getFolio() {
    try {
        const token = await getERPAuthToken();
        const fechaHoy = format(new Date(), "yyyyMMdd");
        const fechaAnterior = format(subDays(new Date(), 3), "yyyyMMdd");
        const fechaTomorrow = format(addDays(new Date(), 1), "yyyyMMdd");
        
        const endpoint = `documents/${RUT_EMPRESA}/NV/V/?df=${fechaAnterior}&dt=${fechaTomorrow}`;
        
        const response = await axios.get(`${ERP_BASE_URL}/${endpoint}`, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const documentos = response.data.data || [];
        
        // Buscar el folio mayor
        let maxFolio = -Infinity;
        documentos.forEach((documento) => {
            if (documento.folio > maxFolio) {
                maxFolio = documento.folio;
            }
        });

        console.log("El folio más grande es:", maxFolio);
        return maxFolio;
        
    } catch (error) {
        console.error("❌ Error al obtener folio:", error.message);
        return 0; // Retornar 0 si hay error, se usará 1 como fallback
    }
}

/**
 * Validar unidad de un producto
 * 
 * @param {string} sku - SKU del producto
 * @returns {Promise<string>} Unidad del producto
 */
async function validateProductUnit(sku) {
    try {
        const token = await getERPAuthToken();
        const response = await axios.get(
            `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}`,
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const unidad = response.data.data?.[0]?.unidadstock || "UMS";
        return unidad;
        
    } catch (error) {
        console.error("❌ Error al validar la unidad del producto:", error.message);
        return "UMS"; // Unidad por defecto
    }
}

/**
 * Crear orden de compra/nota de venta en Manager+
 * 
 * @param {Object} orderData - Datos completos de la orden de Mercado Libre
 * @param {Object} clienteInfo - Información del cliente creado
 * @returns {Promise<Object>} Resultado de la creación
 */
async function createOrder(orderData, clienteInfo) {
    try {
        await getFolio();
        const maxFolio = await getFolio();
        
        const token = await getERPAuthToken();
        const fechaHoy = format(new Date(), "dd/MM/yyyy");
        
        const detalles = [];
        
        // Procesar items de la orden
        for (const item of orderData.order_items || []) {
            const sku = item.item?.seller_custom_field || item.item?.id || '';
            const unidad = await validateProductUnit(sku);
            
            // Calcular precio sin IVA (Mercado Libre incluye impuestos)
            const precioUnit = Math.round((item.unit_price || 0) / 1.19);
            
            const detalle = {
                cod_producto: sku,
                cantidad: (item.quantity || 1).toString(),
                unidad: unidad,
                precio_unit: precioUnit.toString(),
                moneda_det: "CLP",
                tasa_cambio_det: "1",
                nro_serie: "",
                num_lote: "",
                fecha_vec: "",
                cen_cos: "A03",
                tipo_desc: "",
                descuento: "",
                ubicacion: "",
                bodega: "",
                concepto1: "Venta",
                concepto2: "",
                concepto3: "",
                concepto4: "",
                descrip: item.item?.title || 'Producto Mercado Libre',
                desc_adic: "",
                stock: "0",
                cod_impesp1: "",
                mon_impesp1: "",
                cod_impesp2: "",
                mon_impesp2: "",
                fecha_comp: "",
                porc_retencion: ""
            };
            detalles.push(detalle);
        }
        
        // Agregar costo de envío si existe
        const shippingCost = orderData.shipping?.cost || 0;
        if (shippingCost > 0) {
            const despacho = {
                cod_producto: "DPCHO",
                cantidad: "1",
                unidad: "UMS",
                precio_unit: Math.round(shippingCost / 1.19).toString(),
                moneda_det: "CLP",
                tasa_cambio_det: "1",
                nro_serie: "",
                num_lote: "",
                fecha_vec: "",
                cen_cos: "A03",
                tipo_desc: "",
                descuento: "",
                ubicacion: "",
                bodega: "",
                concepto1: "Venta",
                concepto2: "",
                concepto3: "",
                concepto4: "",
                descrip: "DESPACHO e-commerce Mercado Libre",
                desc_adic: "",
                stock: "0",
                cod_impesp1: "",
                mon_impesp1: "",
                cod_impesp2: "",
                mon_impesp2: "",
                fecha_comp: "",
                porc_retencion: ""
            };
            detalles.push(despacho);
        }
        
        // Calcular totales
        const totalPrice = orderData.total_amount || 0;
        const totalDiscounts = orderData.discounts?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
        const subtotal = totalPrice - totalDiscounts;
        const afecto = Math.round(subtotal / 1.19);
        const iva = Math.round(afecto * 0.19);
        
        const infoOrder = {
            rut_empresa: RUT_EMPRESA,
            tipodocumento: "NV",
            num_doc: (maxFolio + 1).toString(),
            fecha_doc: fechaHoy,
            fecha_ref: "",
            fecha_vcto: fechaHoy,
            modalidad: "N",
            cod_unidnegocio: "UNEG-001",
            rut_cliente: clienteInfo.cliente.rut_cliente,
            dire_cliente: "Direccion Mercado Libre",
            rut_facturador: "",
            cod_vendedor: ERP_USERNAME,
            cod_comisionista: ERP_USERNAME,
            lista_precio: "18",
            plazo_pago: "01",
            cod_moneda: "CLP",
            tasa_cambio: "1",
            afecto: afecto.toString(),
            exento: "0",
            iva: iva.toString(),
            imp_esp: "",
            iva_ret: "",
            imp_ret: "",
            tipo_desc_global: "M",
            monto_desc_global: Math.round(totalDiscounts / 1.19).toString(),
            total: totalPrice.toString(),
            deuda_pendiente: "0",
            glosa: `Mercado Libre; Orden: ${orderData.id}; Comprador: ${orderData.buyer?.nickname || 'N/A'}`,
            ajuste_iva: "0",
            detalles: detalles
        };

        console.log("📝 Orden a ingresar:", JSON.stringify(infoOrder, null, 2));

        const response = await axios.post(
            `${ERP_BASE_URL}/import/create-document/?emitir=N&docnumreg=N`,
            infoOrder,
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Orden creada exitosamente en el ERP:", response.data);
        return { success: true, data: response.data, orden: infoOrder };
        
    } catch (error) {
        console.error("❌ Error al crear la orden en el ERP:", error.response?.data?.mensaje || error.message);
        throw error;
    }
}

/**
 * Procesar notificación de orden de Mercado Libre
 * 
 * @param {Object} notificationData - Datos de la notificación
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function processOrderNotification(notificationData) {
    try {
        console.log('📦 Procesando notificación de orden de Mercado Libre...');
        console.log('📋 Datos de notificación:', JSON.stringify(notificationData, null, 2));
        
        // La notificación de Mercado Libre contiene el ID de la orden
        const orderId = notificationData.resource || notificationData.id;
        
        if (!orderId) {
            throw new Error('No se encontró el ID de la orden en la notificación');
        }
        
        // Obtener información completa de la orden
        const orderData = await getMercadoLibreOrder(orderId);
        console.log('✅ Orden obtenida de Mercado Libre:', orderData.id);
        
        // Obtener información del comprador
        const buyerId = orderData.buyer?.id || orderData.buyer_id;
        const buyerData = await getMercadoLibreBuyer(buyerId);
        console.log('✅ Información del comprador obtenida:', buyerData.nickname);
        
        // Crear cliente en Manager+
        const clienteResult = await createClient(orderData, buyerData);
        
        // Crear orden en Manager+
        const ordenResult = await createOrder(orderData, clienteResult);
        
        return {
            success: true,
            orderId: orderData.id,
            cliente: clienteResult,
            orden: ordenResult
        };
        
    } catch (error) {
        console.error('❌ Error al procesar notificación de orden:', error.message);
        throw error;
    }
}

module.exports = {
    processOrderNotification,
    createClient,
    createOrder,
    getMercadoLibreOrder,
    getMercadoLibreBuyer
};

