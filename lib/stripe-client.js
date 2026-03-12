import Stripe from 'stripe';
import { config } from './config.js';

let stripeClient;

function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey);
  }
  return stripeClient;
}

// Buscar cliente y pagos en una sola operacion
export async function enrichWithStripe(email) {
  try {
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return { tiene_pagos: false, total_gastado: 0, pagos: [], telefono: null };
    }

    const customer = customers.data[0];
    const charges = await stripe.charges.list({
      customer: customer.id,
      limit: 50,
    });

    const successfulCharges = charges.data.filter(c => c.status === 'succeeded');
    const totalGastado = successfulCharges.reduce((sum, c) => sum + (c.amount / 100), 0);

    return {
      tiene_pagos: successfulCharges.length > 0,
      total_gastado: Math.round(totalGastado * 100) / 100,
      pagos: successfulCharges.slice(0, 5).map(c => ({
        amount: c.amount / 100,
        currency: c.currency,
        date: new Date(c.created * 1000).toISOString(),
      })),
      telefono: customer.phone || null,
    };
  } catch (err) {
    console.log(`Stripe error for ${email}:`, err.message);
    return { tiene_pagos: false, total_gastado: 0, pagos: [], telefono: null };
  }
}
