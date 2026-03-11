import { config } from './config.js';

const headers = () => ({
  'Authorization': `Bearer ${config.mailerlite.apiKey}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

// Obtener campanas enviadas en los ultimos N dias
export async function getRecentCampaigns(days = 14) {
  const campaigns = [];
  let page = 1;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  while (true) {
    const url = `${config.mailerlite.baseUrl}/campaigns?filter[status]=sent&limit=25&page=${page}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`MailerLite campaigns error: ${res.status}`);
    const data = await res.json();

    for (const campaign of data.data) {
      const scheduledDate = new Date(campaign.scheduled_for);
      if (scheduledDate >= cutoffDate) {
        campaigns.push({
          id: campaign.id,
          name: campaign.name,
          scheduled_for: campaign.scheduled_for,
          stats: campaign.stats,
        });
      }
    }

    // Si la ultima campana de la pagina es anterior al cutoff, paramos
    const lastCampaign = data.data[data.data.length - 1];
    if (!lastCampaign || new Date(lastCampaign.scheduled_for) < cutoffDate) break;
    if (!data.links?.next) break;
    page++;
  }

  return campaigns;
}

// Obtener suscriptores que hicieron click en una campana
export async function getCampaignClickers(campaignId) {
  const clickers = [];
  let page = 1;

  while (true) {
    const url = `${config.mailerlite.baseUrl}/campaigns/${campaignId}/reports/subscriber-activity?page=${page}&limit=100`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.log(`Error getting activity for campaign ${campaignId}: ${res.status}`);
      break;
    }
    const data = await res.json();

    for (const item of data.data) {
      if (item.clicks_count > 0) {
        clickers.push({
          email: item.subscriber_email,
          clicks: item.clicks_count,
          name: item.subscriber?.fields?.name || '',
          last_name: item.subscriber?.fields?.last_name || '',
          phone: item.subscriber?.fields?.phone || null,
        });
      }
    }

    if (!data.links?.next) break;
    page++;
    // Limite de seguridad: maximo 10 paginas por campana
    if (page > 10) break;
  }

  return clickers;
}

// Agregar clicks por email a traves de multiples campanas
export function aggregateClicks(campaignClicksMap) {
  const aggregated = {};

  for (const [campaignName, clickers] of Object.entries(campaignClicksMap)) {
    for (const clicker of clickers) {
      if (!aggregated[clicker.email]) {
        aggregated[clicker.email] = {
          email: clicker.email,
          nombre: clicker.name,
          apellido: clicker.last_name,
          telefono_mailerlite: clicker.phone,
          clicks_totales: 0,
          campanas_clickeadas: [],
        };
      }
      aggregated[clicker.email].clicks_totales += clicker.clicks;
      aggregated[clicker.email].campanas_clickeadas.push(campaignName);
    }
  }

  return Object.values(aggregated);
}

// Enviar email personalizado via MailerLite (crear campana y enviar a un suscriptor)
export async function sendPersonalizedEmail(subscriberEmail, subject, htmlContent) {
  // MailerLite no tiene endpoint directo de "enviar email a 1 persona"
  // Usamos la API de automation/triggers o creamos un email via la cuenta
  // Alternativa practica: usar el endpoint de subscribers para agregar a un grupo
  // y tener una automatizacion que envie el email

  // Opcion mas directa: crear una campana dirigida a un solo suscriptor
  // Pero es mas practico usar un webhook o enviar directamente

  // Por ahora, logeamos la accion (se puede integrar con un servicio SMTP directo)
  console.log(`[EMAIL] Pendiente enviar a ${subscriberEmail}: ${subject}`);

  // Intentar enviar via la API de MailerLite creando un subscriber y usando automation
  // Para envio directo, se recomienda integrar con un SMTP como Resend o SendGrid
  return { sent: false, method: 'pending_integration', email: subscriberEmail, subject };
}
