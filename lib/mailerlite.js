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
    const url = `${config.mailerlite.baseUrl}/campaigns?filter%5Bstatus%5D=sent&limit=25&page=${page}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`MailerLite campaigns error: ${res.status}`);
    const data = await res.json();

    for (const campaign of data.data) {
      if (!campaign.scheduled_for) continue;
      const scheduledDate = new Date(campaign.scheduled_for);
      if (scheduledDate >= cutoffDate && campaign.stats.clicks_count > 0) {
        campaigns.push({
          id: campaign.id,
          name: campaign.name,
          scheduled_for: campaign.scheduled_for,
          stats: campaign.stats,
        });
      }
    }

    const lastCampaign = data.data[data.data.length - 1];
    if (!lastCampaign || !lastCampaign.scheduled_for) break;
    if (new Date(lastCampaign.scheduled_for) < cutoffDate) break;
    if (!data.links?.next) break;
    page++;
  }

  return campaigns;
}

// Obtener SOLO suscriptores que hicieron click en una campana
export async function getCampaignClickers(campaignId) {
  const clickers = [];
  let page = 1;

  while (true) {
    // CLAVE: filter[type]=clicked para obtener solo quienes clickearon
    const url = `${config.mailerlite.baseUrl}/campaigns/${campaignId}/reports/subscriber-activity?filter%5Btype%5D=clicked&page=${page}&limit=100`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.log(`Error getting clickers for campaign ${campaignId}: ${res.status}`);
      break;
    }
    const data = await res.json();

    if (!data.data || data.data.length === 0) break;

    for (const item of data.data) {
      const clicks = item.clicks_count > 0 ? item.clicks_count : 1;
      clickers.push({
        email: item.subscriber_email,
        clicks,
        name: item.subscriber?.fields?.name || '',
        last_name: item.subscriber?.fields?.last_name || '',
        phone: item.subscriber?.fields?.phone || null,
      });
    }

    if (!data.links?.next) break;
    page++;
    if (page > 5) break; // Limite de seguridad
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
      if (!aggregated[clicker.email].campanas_clickeadas.includes(campaignName)) {
        aggregated[clicker.email].campanas_clickeadas.push(campaignName);
      }
    }
  }

  return Object.values(aggregated);
}
