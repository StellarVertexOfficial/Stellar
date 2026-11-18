# Checkout Pro en StellarVertex

El botón «Pagar ahora» abre Mercado Pago con el total calculado por Netlify a $99 MXN por mapa. El pedido se guarda en Netlify Blobs antes de abrir el pago y el folio vincula el pago al mapa y correo de entrega. El estado público del pedido no incluye la personalización ni el correo.

## Prueba en Netlify

1. Guarda el Access Token de prueba en `MERCADOPAGO_ACCESS_TOKEN`, con alcance **Functions** y contexto **Deploy Previews**.
2. Abre una vista previa de Netlify que incluya estos cambios. Abre la tienda, agrega un mapa y pulsa **Pagar ahora**. Prueba la aprobación y el rechazo en la página de Mercado Pago con un comprador de prueba y los datos del panel de Mercado Pago. Comprueba que el pedido conserve el correo, la personalización, el importe y el folio.
3. En **Configuración de webhooks** de la aplicación de Mercado Pago, activa el evento **Pagos**. Usa el URL de esa vista previa seguido de `/.netlify/functions/mercadopago-webhook`. Guarda la clave de firma de ese webhook en `MERCADOPAGO_WEBHOOK_SECRET` en el mismo contexto de Netlify y genera otro despliegue. La página de regreso también verifica los pagos consultando la API de Mercado Pago.
4. Busca el folio en el almacén **stellar-orders-test** desde el panel de Netlify. Si usas la CLI autenticada y enlazada al sitio, puedes consultar un pedido con `netlify blobs:get stellar-orders-test FOLIO`. Esa salida contiene datos del comprador y debe permanecer privada.

## Producción

Configura las variables de **Functions** en el contexto **Production** con el Access Token real, la clave de firma del webhook de producción y `MERCADOPAGO_MODE=production`. Registra `https://stellarvertex.com/.netlify/functions/mercadopago-webhook` para el evento Pagos y publica un nuevo despliegue. Los pedidos reales se guardan en el almacén **stellar-orders**. Entrega el PDF manualmente solo cuando el pago del folio figure como aprobado. La generación privada del PDF final se gestiona por separado.
