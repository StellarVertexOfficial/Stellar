# Checkout Pro en StellarVertex

El botón «Pagar ahora» abre Mercado Pago con el total calculado por Netlify a $99 MXN por mapa. El pedido se guarda en Netlify Blobs antes de abrir el pago y el folio vincula el pago al mapa y correo de entrega. El estado público del pedido no incluye la personalización ni el correo.

## Prueba en Netlify

1. Guarda el Access Token de prueba en `MERCADOPAGO_ACCESS_TOKEN`, con alcance **Functions** y contexto **Deploy Previews**.
2. Abre una vista previa de Netlify que incluya estos cambios. Abre la tienda, agrega un mapa y pulsa **Pagar ahora**. Prueba la aprobación y el rechazo en la página de Mercado Pago con un comprador de prueba y los datos del panel de Mercado Pago. Comprueba que el pedido conserve el correo, la personalización, el importe y el folio.
3. En **Configuración de webhooks** de la aplicación de Mercado Pago, activa el evento **Pagos**. Usa el URL de esa vista previa seguido de `/.netlify/functions/mercadopago-webhook`. Guarda la clave de firma de ese webhook en `MERCADOPAGO_WEBHOOK_SECRET` en el mismo contexto de Netlify y genera otro despliegue. La página de regreso también verifica los pagos consultando la API de Mercado Pago.
4. Busca el folio en el almacén **stellar-orders-test** desde el panel de Netlify. Si usas la CLI autenticada y enlazada al sitio, puedes consultar un pedido con `netlify blobs:get stellar-orders-test FOLIO`. Esa salida contiene datos del comprador y debe permanecer privada.

## Producción

Configura las variables de **Functions** en el contexto **Production** con el Access Token real, la clave de firma del webhook de producción y `MERCADOPAGO_MODE=production`. Registra `https://stellarvertex.com/.netlify/functions/mercadopago-webhook` para el evento Pagos y publica un nuevo despliegue. Los pedidos reales se guardan en **stellar-orders**.

## Entrega por correo

1. Agrega y verifica `stellarvertex.com` en [Resend](https://resend.com/domains). Copia los registros DNS que te indique Resend al panel que administra el dominio.
2. Crea una clave de Resend con permiso de envío para el dominio verificado. Guarda la clave como `RESEND_API_KEY`, en **Production** y con alcance **Functions** en Netlify. El remitente predeterminado es `StellarVertex <pedidos@stellarvertex.com>`. Si verificaste otro dominio o prefieres otra dirección, guarda el remitente correspondiente en `STELLAR_EMAIL_FROM`.
3. Publica un nuevo despliegue. En la primera venta aprobada, compara el folio con la operación en Mercado Pago y confirma que Resend muestra el correo con el PDF adjunto. La entrega funciona aunque el comprador cierre Checkout Pro antes de regresar a la tienda.

Los pedidos creados en producción con la clave configurada quedan programados para entrega automática. El aviso firmado de Mercado Pago activa el envío cuando la API confirma que el pago aprobado coincide con el folio, el importe y el vendedor. El adjunto contiene una página vectorial de 30 × 40 cm por cada diseño distinto del pedido. La vista previa pública sigue mostrando su marca de agua.

El pedido privado conserva el estado `delivery.status`, el identificador devuelto por Resend y la fecha de envío. Ante un error, el webhook devuelve un error temporal para que Mercado Pago reintente con la misma clave de idempotencia. Si llega un nuevo aviso 23 horas después del primer intento y el envío sigue incierto, el pedido pasa a revisión para evitar un segundo correo. En ese caso, revisa primero el folio en Resend antes de enviar manualmente. Los pedidos creados antes de la activación conservan la entrega manual. Los pagos de prueba no generan correos.
