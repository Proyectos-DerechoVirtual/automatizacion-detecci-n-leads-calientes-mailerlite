import { config } from './config.js';

const headers = () => ({
  'Authorization': `Bearer ${config.calendly.token}`,
  'Content-Type': 'application/json',
});

// Buscar eventos agendados por email del invitado
export async function findEventsByEmail(email) {
  try {
    const params = new URLSearchParams({
      organization: config.calendly.orgUri,
      invitee_email: email,
      count: '5',
    });

    const url = `${config.calendly.baseUrl}/scheduled_events?${params}`;
    const res = await fetch(url, { headers: headers() });

    if (!res.ok) return [];
    const data = await res.json();
    return data.collection || [];
  } catch (err) {
    console.log(`Calendly events error for ${email}:`, err.message);
    return [];
  }
}

// Obtener invitees de un evento para extraer telefono
export async function getEventInvitees(eventUri) {
  try {
    const url = `${eventUri}/invitees`;
    const res = await fetch(url, { headers: headers() });

    if (!res.ok) return [];
    const data = await res.json();
    return data.collection || [];
  } catch (err) {
    console.log(`Calendly invitees error:`, err.message);
    return [];
  }
}

// Detectar si un texto parece un numero de telefono (7+ digitos)
function looksLikePhone(text) {
  if (!text) return false;
  const digits = text.replace(/[^0-9]/g, '');
  return digits.length >= 7;
}

// Extraer telefono de un invitee
// NOTA: Las preguntas de Calendly pueden venir con encoding roto
// (ej: "Â¿CuÃ¡l es tu nÃºmero de telÃ©fono?" en vez de "¿Cuál es tu número de teléfono?")
// Por eso NO dependemos del texto de la pregunta, sino del formato de la respuesta
function extractPhone(invitee) {
  // 1. Buscar en text_reminder_number (fuente mas fiable)
  if (invitee.text_reminder_number) {
    return invitee.text_reminder_number;
  }

  // 2. Buscar en questions_and_answers - detectar respuestas con formato de telefono
  if (invitee.questions_and_answers) {
    for (const qa of invitee.questions_and_answers) {
      const answer = (qa.answer || '').trim();
      if (looksLikePhone(answer)) {
        return answer;
      }
    }
  }

  return null;
}

// Enriquecer lead con datos de Calendly (buscar telefono)
export async function enrichWithCalendly(email) {
  const events = await findEventsByEmail(email);

  if (events.length === 0) {
    return { tiene_evento: false, telefono: null };
  }

  // Revisar invitees de cada evento buscando telefono
  for (const event of events) {
    const invitees = await getEventInvitees(event.uri);
    for (const invitee of invitees) {
      if (invitee.email.toLowerCase() === email.toLowerCase()) {
        const phone = extractPhone(invitee);
        if (phone) {
          return { tiene_evento: true, telefono: phone };
        }
      }
    }
  }

  return { tiene_evento: true, telefono: null };
}
