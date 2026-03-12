import { config } from './config.js';

const UA = 'LeadsCalientes/1.0';

const hdrs = () => ({
  'Authorization': `Bearer ${config.calendly.token}`,
  'Content-Type': 'application/json',
  'User-Agent': UA,
});

// Fetch con timeout de 4 segundos
async function fetchWithTimeout(url, options, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Buscar eventos agendados por email del invitado
export async function findEventsByEmail(email) {
  try {
    const params = new URLSearchParams({
      organization: config.calendly.orgUri,
      invitee_email: email,
      count: '3',
    });

    const url = `${config.calendly.baseUrl}/scheduled_events?${params}`;
    const res = await fetchWithTimeout(url, { headers: hdrs() });

    if (!res.ok) {
      console.log(`[Calendly] ${res.status} for ${email}`);
      return [];
    }
    const data = await res.json();
    return data.collection || [];
  } catch (err) {
    console.log(`[Calendly] Error for ${email}: ${err.message}`);
    return [];
  }
}

// Obtener invitees de un evento para extraer telefono
export async function getEventInvitees(eventUri) {
  try {
    const url = `${eventUri}/invitees`;
    const res = await fetchWithTimeout(url, { headers: hdrs() });

    if (!res.ok) return [];
    const data = await res.json();
    return data.collection || [];
  } catch (err) {
    console.log(`[Calendly] Invitees error: ${err.message}`);
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
function extractPhone(invitee) {
  if (invitee.text_reminder_number) {
    return invitee.text_reminder_number;
  }
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
