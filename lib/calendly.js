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
      count: '10',
      status: 'active',
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

// Extraer telefono de un invitee (de questions_and_answers o text_reminder)
function extractPhone(invitee) {
  // Buscar en text_reminder_number
  if (invitee.text_reminder_number) {
    return invitee.text_reminder_number;
  }

  // Buscar en questions_and_answers
  if (invitee.questions_and_answers) {
    for (const qa of invitee.questions_and_answers) {
      const question = (qa.question || '').toLowerCase();
      if (question.includes('telef') || question.includes('phone') || question.includes('movil') || question.includes('whatsapp')) {
        if (qa.answer && qa.answer.trim()) return qa.answer.trim();
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
