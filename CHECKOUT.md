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
3. Publica un nuevo despliegue. Para comprobar la primera venta, busca el folio en **stellar-orders** y el identificador `delivery.providerId` en **Emails** de Resend. El evento **Delivered** indica que el servidor de correo del destinatario aceptó el mensaje.

La tienda pausa los cobros nuevos si falta `RESEND_API_KEY` en producción. Cada preferencia de pago real incluye la URL del webhook de StellarVertex. El aviso firmado permite enviar el PDF aunque el comprador cierre la página. Si el comprador regresa antes del aviso, la página de confirmación consulta el pago y también puede iniciar la entrega. Ambas vías verifican el folio, el vendedor, el modo, la moneda y el importe con la API de Mercado Pago, y usan la misma clave de envío por pedido.

El correo se dirige a la dirección escrita en el carrito. El adjunto contiene una página vectorial de 30 × 40 cm por cada diseño distinto. La vista previa pública lleva marca de agua.

El pedido privado conserva el estado `delivery.status`, el identificador devuelto por Resend y la fecha de envío. `sent` indica que Resend aceptó la solicitud. Ante un error temporal, Mercado Pago puede repetir el webhook. El comprador que regresó con un pago aprobado también puede pulsar **Actualizar estado** para reintentar un envío pendiente. Si llega un aviso después de 23 horas desde el primer intento y el envío sigue incierto, el pedido pasa a revisión. Revisa su historial en Resend antes de un envío manual. Los pedidos antiguos ya pagados con entrega manual conservan ese tratamiento. Los pagos de prueba no generan correos.
