import { config } from '../../lib/config.js';
import { getRecentCampaigns, getCampaignClickers, aggregateClicks } from '../../lib/mailerlite.js';
import { wasRecentlyContacted, upsertLead } from '../../lib/supabase.js';
import { enrichWithTeachable } from '../../lib/teachable.js';
import { enrichWithStripe } from '../../lib/stripe-client.js';
import { enrichWithCalendly } from '../../lib/calendly.js';
import { sendWhatsApp, buildWhatsAppMessage } from '../../lib/ultramsg.js';

export default async function handler(req, res) {
  // Verificar que es una peticion autorizada (cron de Vercel o con secret)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Permitir si viene del cron de Vercel (header especial)
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

    // PASO 1: Obtener campanas recientes
    addLog(`Buscando campanas de los ultimos ${config.lookbackDays} dias...`);
    const campaigns = await getRecentCampaigns(config.lookbackDays);
    addLog(`Encontradas ${campaigns.length} campanas recientes`);

    // PASO 2: Obtener clickers por campana
    const campaignClicksMap = {};
    for (const campaign of campaigns) {
      addLog(`Analizando clicks de: ${campaign.name}`);
      const clickers = await getCampaignClickers(campaign.id);
      if (clickers.length > 0) {
        campaignClicksMap[campaign.name] = clickers;
        addLog(`  -> ${clickers.length} suscriptores con clicks`);
      }
    }

    // PASO 3: Agregar clicks y filtrar por umbral
    const allLeads = aggregateClicks(campaignClicksMap);
    const hotLeads = allLeads.filter(l => l.clicks_totales >= config.clickThreshold);
    addLog(`Total leads con clicks: ${allLeads.length} | Leads calientes (${config.clickThreshold}+ clicks): ${hotLeads.length}`);

    // Clasificar por urgencia
    for (const lead of hotLeads) {
      lead.nivel_urgencia = lead.clicks_totales >= 10 ? 'hot' : 'warm';
    }

    // PASO 4: Procesar cada lead caliente
    const results = { processed: 0, skipped: 0, whatsapp_sent: 0, email_pending: 0, errors: 0 };

    for (const lead of hotLeads) {
      try {
        addLog(`\nProcesando: ${lead.email} (${lead.clicks_totales} clicks - ${lead.nivel_urgencia})`);

        // Verificar si ya fue contactado recientemente
        const recentlyContacted = await wasRecentlyContacted(lead.email, config.cooldownDays);
        if (recentlyContacted) {
          addLog(`  SKIP: ya contactado en los ultimos ${config.cooldownDays} dias`);
          results.skipped++;
          continue;
        }

        // Enriquecer con Teachable
        const teachableData = await enrichWithTeachable(lead.email);
        lead.tiene_cursos_teachable = teachableData.tiene_cursos;
        lead.cursos_teachable = teachableData.cursos.length > 0 ? teachableData.cursos : null;
        addLog(`  Teachable: ${teachableData.tiene_cursos ? `SI (${teachableData.cursos.length} cursos)` : 'No tiene cursos'}`);

        // Enriquecer con Stripe
        const stripeData = await enrichWithStripe(lead.email);
        lead.tiene_pagos_stripe = stripeData.tiene_pagos;
        lead.total_gastado_stripe = stripeData.total_gastado;
        const stripePhone = stripeData.telefono;
        addLog(`  Stripe: ${stripeData.tiene_pagos ? `SI ($${stripeData.total_gastado})` : 'Sin pagos'}`);

        // Enriquecer con Calendly
        const calendlyData = await enrichWithCalendly(lead.email);
        lead.tiene_evento_calendly = calendlyData.tiene_evento;
        const calendlyPhone = calendlyData.telefono;
        addLog(`  Calendly: ${calendlyData.tiene_evento ? 'SI tiene eventos' : 'Sin eventos'} | Tel: ${calendlyPhone || 'no'}`);

        // Determinar telefono (prioridad: Calendly > Stripe > MailerLite)
        const telefono = calendlyPhone || stripePhone || lead.telefono_mailerlite;
        lead.telefono = telefono;

        // PASO 5: Contactar
        if (telefono) {
          // Enviar WhatsApp
          const message = buildWhatsAppMessage(lead);
          const whatsappResult = await sendWhatsApp(telefono, message);

          if (whatsappResult.sent) {
            lead.canal_contacto = 'whatsapp';
            lead.estado = 'contactado';
            lead.fecha_ultimo_contacto = new Date().toISOString();
            results.whatsapp_sent++;
            addLog(`  WHATSAPP ENVIADO a ${telefono}`);
          } else {
            lead.canal_contacto = 'pendiente';
            addLog(`  WHATSAPP FALLO: ${JSON.stringify(whatsappResult.error)}`);
          }
        } else {
          // Sin telefono -> marcar para email
          lead.canal_contacto = 'email';
          lead.estado = 'contactado';
          lead.fecha_ultimo_contacto = new Date().toISOString();
          results.email_pending++;
          addLog(`  SIN TELEFONO -> Email pendiente`);
        }

        // Guardar en Supabase
        await upsertLead(lead);
        results.processed++;
        addLog(`  Guardado en Supabase`);

      } catch (leadError) {
        results.errors++;
        addLog(`  ERROR procesando ${lead.email}: ${leadError.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog(`\n=== RESUMEN ===`);
    addLog(`Duracion: ${duration}s`);
    addLog(`Campanas analizadas: ${campaigns.length}`);
    addLog(`Leads calientes encontrados: ${hotLeads.length}`);
    addLog(`Procesados: ${results.processed} | Skipped: ${results.skipped}`);
    addLog(`WhatsApp enviados: ${results.whatsapp_sent} | Emails pendientes: ${results.email_pending}`);
    addLog(`Errores: ${results.errors}`);

    return res.status(200).json({
      success: true,
      duration: `${duration}s`,
      campaigns_analyzed: campaigns.length,
      hot_leads_found: hotLeads.length,
      results,
      log,
    });

  } catch (error) {
    addLog(`ERROR FATAL: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message,
      log,
    });
  }
}
