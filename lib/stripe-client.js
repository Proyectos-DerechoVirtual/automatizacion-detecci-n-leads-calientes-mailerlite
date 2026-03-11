import Stripe from 'stripe';
import { config } from './config.js';

let stripeClient;

function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey);
  }
  return stripeClient;
}

// Buscar cliente en Stripe por email
export async function findCustomerByEmail(email) {
  try {
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email, limit: 1 });
    return customers.data.length > 0 ? customers.data[0] : null;
  } catch (err) {
    console.log(`Stripe customer error for ${email}:`, err.message);
    return null;
  }
}

// Obtener historial de pagos de un cliente
export async function getCustomerPayments(customerId) {
  try {
    const stripe = getStripe();
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 100,
    });
    return charges.data;
  } catch (err) {
    console.log(`Stripe charges error for ${customerId}:`, err.message);
    return [];
  }
}

// Enriquecer lead con datos de Stripe
export async function enrichWithStripe(email) {
  const customer = await findCustomerByEmail(email);
  if (!customer) {
    return { tiene_pagos: false, total_gastado: 0, pagos: [], telefono: customer?.phone || null };
  }

  const charges = await getCustomerPayments(customer.id);
  const successfulCharges = charges.filter(c => c.status === 'succeeded');
  const totalGastado = successfulCharges.reduce((sum, c) => sum + (c.amount / 100), 0);

  return {
    tiene_pagos: successfulCharges.length > 0,
    total_gastado: Math.round(totalGastado * 100) / 100,
    pagos: successfulCharges.map(c => ({
      amount: c.amount / 100,
      currency: c.currency,
      date: new Date(c.created * 1000).toISOString(),
      description: c.description,
    })),
    telefono: customer.phone || null,
  };
}
