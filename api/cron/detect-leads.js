import { config } from '../../lib/config.js';
import { getRecentCampaigns, getCampaignClickers, aggregateClicks } from '../../lib/mailerlite.js';
import { wasRecentlyContacted, upsertLead } from '../../lib/supabase.js';
import { enrichWithTeachable } from '../../lib/teachable.js';
import { enrichWithStripe } from '../../lib/stripe-client.js';
import { enrichWithCalendly } from '../../lib/calendly.js';
import { sendWhatsApp, buildWhatsAppMessage } from '../../lib/ultramsg.js';

// Limite de leads a procesar por ejecucion (para no exceder timeout de 60s)
const MAX_LEADS_PER_RUN = 10;

export default async function handler(req, res) {
  // Verificar autorizacion
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (!isVercelCron) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const startTime = Date.now();
  const log = [];
  const addLog = (msg) => { log.push(`[${new Date().toISOString()}] ${msg}`); console.log(msg); };

  try {
    addLog('=== INICIO: Deteccion de leads calientes ===');

    // PASO 1: Obtener campanas recientes (solo las que tienen clicks)
    addLog(`Buscando campanas de los ultimos ${config.lookbackDays} dias...`);
    const campaigns = await getRecentCampaigns(config.lookbackDays);
    addLog(`Encontradas ${campaigns.length} campanas con clicks`);

    // PASO 2: Obtener clickers por campana (en paralelo, batches de 5)
    const campaignClicksMap = {};
    const batchSize = 5;
    for (let i = 0; i < campaigns.length; i += batchSize) {
      const batch = campaigns.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (campaign) => {
          const clickers = await getCampaignClickers(campaign.id);
          return { name: campaign.name, clickers };
        })
      );
      for (const { name, clickers } of results) {
        if (clickers.length > 0) {
          campaignClicksMap[name] = clickers;
          addLog(`  ${name}: ${clickers.length} clickers`);
        }
      }
    }

    // PASO 3: Agregar clicks y filtrar por umbral
    const allLeads = aggregateClicks(campaignClicksMap);
    const hotLeads = allLeads
      .filter(l => l.clicks_totales >= config.clickThreshold)
      .sort((a, b) => b.clicks_totales - a.clicks_totales);

    addLog(`Total leads con clicks: ${allLeads.length} | Leads calientes (${config.clickThreshold}+ clicks): ${hotLeads.length}`);

    // Clasificar por urgencia
    for (const lead of hotLeads) {
      lead.nivel_urgencia = lead.clicks_totales >= 10 ? 'hot' : 'warm';
    }

    // PASO 4: Procesar leads (limitado para respetar timeout)
    const leadsToProcess = hotLeads.slice(0, MAX_LEADS_PER_RUN);
    const stats = { processed: 0, skipped: 0, whatsapp_sent: 0, email_pending: 0, errors: 0 };

    for (const lead of leadsToProcess) {
      // Verificar timeout (dejar 10s de margen)
      if (Date.now() - startTime > 50000) {
        addLog(`TIMEOUT PREVENTIVO: quedan ${hotLeads.length - stats.processed - stats.skipped} leads sin procesar`);
        break;
      }

      try {
        addLog(`\nProcesando: ${lead.email} (${lead.clicks_totales} clicks - ${lead.nivel_urgencia})`);

        // Verificar cooldown
        const recentlyContacted = await wasRecentlyContacted(lead.email, config.cooldownDays);
        if (recentlyContacted) {
          addLog(`  SKIP: contactado en ultimos ${config.cooldownDays} dias`);
          stats.skipped++;
          continue;
        }

        // Enriquecer en paralelo (Teachable + Stripe + Calendly)
        const [teachableData, stripeData, calendlyData] = await Promise.all([
          enrichWithTeachable(lead.email),
          enrichWithStripe(lead.email),
          enrichWithCalendly(lead.email),
        ]);

        lead.tiene_cursos_teachable = teachableData.tiene_cursos;
        lead.cursos_teachable = teachableData.cursos.length > 0 ? teachableData.cursos : null;
        lead.tiene_pagos_stripe = stripeData.tiene_pagos;
        lead.total_gastado_stripe = stripeData.total_gastado;
        lead.tiene_evento_calendly = calendlyData.tiene_evento;

        const stripePhone = stripeData.telefono;
        const calendlyPhone = calendlyData.telefono;

        addLog(`  Teachable: ${teachableData.tiene_cursos ? 'SI' : 'No'} | Stripe: ${stripeData.tiene_pagos ? `SI ($${stripeData.total_gastado})` : 'No'} | Calendly: ${calendlyData.tiene_evento ? 'SI' : 'No'}`);

        // Determinar telefono (prioridad: Calendly > Stripe > MailerLite)
        const telefono = calendlyPhone || stripePhone || lead.telefono_mailerlite;
        lead.telefono = telefono;

        // PASO 5: Contactar
        if (telefono) {
          const message = buildWhatsAppMessage(lead);
          const whatsappResult = await sendWhatsApp(telefono, message);

          if (whatsappResult.sent) {
            lead.canal_contacto = 'whatsapp';
            lead.estado = 'contactado';
            lead.fecha_ultimo_contacto = new Date().toISOString();
            stats.whatsapp_sent++;
            addLog(`  WHATSAPP ENVIADO a ${telefono}`);
          } else {
            lead.canal_contacto = 'pendiente';
            addLog(`  WHATSAPP FALLO`);
          }
        } else {
          lead.canal_contacto = 'email';
          lead.estado = 'contactado';
          lead.fecha_ultimo_contacto = new Date().toISOString();
          stats.email_pending++;
          addLog(`  SIN TELEFONO -> marcado para email`);
        }

        // Guardar en Supabase
        await upsertLead(lead);
        stats.processed++;
        addLog(`  Guardado en Supabase`);

      } catch (leadError) {
        stats.errors++;
        addLog(`  ERROR: ${leadError.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog(`\n=== RESUMEN ===`);
    addLog(`Duracion: ${duration}s | Campanas: ${campaigns.length} | Hot leads: ${hotLeads.length}`);
    addLog(`Procesados: ${stats.processed} | Skipped: ${stats.skipped} | WhatsApp: ${stats.whatsapp_sent} | Email: ${stats.email_pending} | Errors: ${stats.errors}`);

    return res.status(200).json({
      success: true,
      duration: `${duration}s`,
      campaigns_analyzed: campaigns.length,
      hot_leads_found: hotLeads.length,
      leads_processed_this_run: stats.processed + stats.skipped,
      stats,
      log,
    });

  } catch (error) {
    addLog(`ERROR FATAL: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message, log });
  }
}
