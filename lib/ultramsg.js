import { config } from './config.js';

// Enviar mensaje de WhatsApp via UltraMsg
export async function sendWhatsApp(phone, message) {
  try {
    const url = `https://api.ultramsg.com/${config.ultramsg.instance}/messages/chat`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: config.ultramsg.token,
        to: phone,
        body: message,
      }),
    });

    const data = await res.json();

    if (data.sent === 'true' || data.sent === true) {
      console.log(`[WHATSAPP] Enviado a ${phone}`);
      return { sent: true, phone };
    }

    console.log(`[WHATSAPP] Error enviando a ${phone}:`, JSON.stringify(data));
    return { sent: false, phone, error: data };
  } catch (err) {
    console.log(`[WHATSAPP] Exception enviando a ${phone}:`, err.message);
    return { sent: false, phone, error: err.message };
  }
}

// Generar mensaje personalizado para el lead
export function buildWhatsAppMessage(lead) {
  const nombre = lead.nombre || 'amigo/a';

  // Determinar producto de interes basado en campanas clickeadas
  let producto = 'nuestros recursos';
  const campanas = (lead.campanas_clickeadas || []).join(' ').toLowerCase();

  if (campanas.includes('justicia')) producto = 'las oposiciones de Justicia';
  else if (campanas.includes('iipp') || campanas.includes('penitenciari')) producto = 'las oposiciones de Instituciones Penitenciarias';
  else if (campanas.includes('abogac')) producto = 'el Examen de Acceso a la Abogacia';
  else if (campanas.includes('hacienda')) producto = 'las oposiciones de Agente de Hacienda';
  else if (campanas.includes('pack') || campanas.includes('cuatrimestre')) producto = 'nuestros packs de estudio';
  else if (campanas.includes('procesal')) producto = 'Derecho Procesal';

  let mensaje = `Hola ${nombre}! Soy Lucia de Derecho Virtual. `;
  mensaje += `He visto que llevas tiempo interesandote por ${producto} y queria escribirte personalmente. `;

  if (lead.tiene_cursos_teachable) {
    mensaje += `Ademas, ya formas parte de nuestra comunidad de estudiantes. `;
  }

  mensaje += `Me encantaria poder ayudarte con una orientacion gratuita. `;
  mensaje += `Te vendria bien una llamada rapida esta semana? Solo 10 minutos para resolver tus dudas.`;

  return mensaje;
}
