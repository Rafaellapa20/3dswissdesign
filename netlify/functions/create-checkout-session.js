// Netlify Function for Stripe Checkout
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { items, shippingData, paymentMethod } = JSON.parse(event.body);

    // Calculate totals
    const subtotal = items.reduce((sum, item) => 
      sum + (item.product.price * item.quantity), 0
    );
    const freeShippingThreshold = 79;
    const shippingCost = subtotal >= freeShippingThreshold ? 0 : 8.90;
    const total = subtotal + shippingCost;

    // Create line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.product.name,
          description: item.product.shortDescription || '',
          images: item.product.images ? [item.product.images[0]] : [],
        },
        unit_amount: Math.round(item.product.price * 100), // Convert to cents
      },
      quantity: item.quantity,
    }));

    // Add shipping as line item if applicable
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: 'Versand',
            description: 'Standard Versand Schweiz',
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL || 'https://3dswissdesign.com'}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL || 'https://3dswissdesign.com'}/checkout-cancel`,
      customer_email: shippingData.email,
      shipping_address_collection: {
        allowed_countries: ['CH'], // Only Switzerland
      },
      metadata: {
        customer_name: `${shippingData.firstName} ${shippingData.lastName}`,
        customer_phone: shippingData.phone || '',
        shipping_address: `${shippingData.address}, ${shippingData.zip} ${shippingData.city}`,
        order_items: items.map(i => `${i.product.name} x${i.quantity}`).join(', '),
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        url: session.url,
        sessionId: session.id 
      }),
    };

  } catch (error) {
    console.error('Stripe error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create checkout session',
        message: error.message 
      }),
    };
  }
};
