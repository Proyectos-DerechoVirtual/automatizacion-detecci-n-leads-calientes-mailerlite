import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client;

export function getSupabase() {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.key);
  }
  return client;
}

const TABLE = 'leads_mailerlite';

// Verificar si un lead ya fue contactado recientemente
export async function wasRecentlyContacted(email, cooldownDays = 30) {
  const supabase = getSupabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cooldownDays);

  const { data, error } = await supabase
    .from(TABLE)
    .select('email, estado, fecha_ultimo_contacto')
    .eq('email', email)
    .gte('fecha_ultimo_contacto', cutoff.toISOString())
    .maybeSingle();

  if (error) {
    console.log(`Supabase lookup error for ${email}:`, error.message);
    return false;
  }

  return !!data;
}

// Insertar o actualizar un lead
export async function upsertLead(lead) {
  const supabase = getSupabase();

  const record = {
    email: lead.email,
    nombre: lead.nombre || null,
    apellido: lead.apellido || null,
    telefono: lead.telefono || null,
    clicks_totales: lead.clicks_totales,
    campanas_clickeadas: lead.campanas_clickeadas,
    nivel_urgencia: lead.nivel_urgencia,
    tiene_cursos_teachable: lead.tiene_cursos_teachable || false,
    cursos_teachable: lead.cursos_teachable || null,
    tiene_pagos_stripe: lead.tiene_pagos_stripe || false,
    total_gastado_stripe: lead.total_gastado_stripe || 0,
    tiene_evento_calendly: lead.tiene_evento_calendly || false,
    canal_contacto: lead.canal_contacto || 'pendiente',
    estado: lead.estado || 'nuevo',
    fecha_ultimo_contacto: lead.fecha_ultimo_contacto || null,
    fecha_actualizacion: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(record, { onConflict: 'email' })
    .select();

  if (error) {
    console.log(`Supabase upsert error for ${lead.email}:`, error.message);
    return null;
  }

  return data?.[0];
}

// Obtener leads pendientes de contactar
export async function getPendingLeads() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('estado', 'nuevo')
    .order('clicks_totales', { ascending: false });

  if (error) {
    console.log('Supabase getPendingLeads error:', error.message);
    return [];
  }
  return data || [];
}
