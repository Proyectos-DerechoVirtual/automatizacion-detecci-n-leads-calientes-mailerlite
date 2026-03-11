export const config = {
  mailerlite: {
    apiKey: process.env.MAILERLITE_API_KEY,
    baseUrl: 'https://connect.mailerlite.com/api',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  teachable: {
    apiKey: process.env.TEACHABLE_API_KEY,
    baseUrl: 'https://developers.teachable.com/v1',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
  },
  calendly: {
    token: process.env.CALENDLY_TOKEN,
    orgUri: process.env.CALENDLY_ORG_URI,
    userUri: process.env.CALENDLY_USER_URI,
    baseUrl: 'https://api.calendly.com',
  },
  ultramsg: {
    token: process.env.ULTRAMSG_TOKEN,
    instance: process.env.ULTRAMSG_INSTANCE,
  },
  // Dias hacia atras para buscar campanas
  lookbackDays: 14,
  // Umbral minimo de clicks para considerar lead caliente
  clickThreshold: 5,
  // Dias desde ultimo contacto para no re-contactar
  cooldownDays: 30,
};
