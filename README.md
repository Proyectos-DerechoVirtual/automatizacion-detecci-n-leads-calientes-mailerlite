# Sistema Automatizado de Deteccion de Leads Calientes

Sistema que cada dia analiza la actividad de suscriptores en **MailerLite**, detecta oportunidades de venta (leads calientes) y dispara acciones comerciales personalizadas via **WhatsApp** o **Email**.

Desarrollado para **Derecho Virtual** (derechovirtual.org).

---

## Como funciona

El sistema se ejecuta diariamente a las 8:00 AM (hora Colombia) mediante un cron job externo que llama al endpoint desplegado en Vercel.

### Flujo completo (5 pasos)

```
MailerLite (clicks) --> Supabase (filtro) --> Teachable + Stripe + Calendly (enriquecimiento) --> WhatsApp o Email (contacto)
```

#### PASO 1: Revision diaria de leads (MailerLite)
- Consulta la API de MailerLite para obtener campanas enviadas en los ultimos **14 dias**
- Para cada campana, obtiene la actividad de suscriptores (quien hizo click)
- Agrega los clicks por email a traves de todas las campanas

#### PASO 2: Filtrado y persistencia (Supabase)
- Base de datos con todos los leads ya procesados (tabla `leads_mailerlite`)
- Antes de procesar un lead, verifica si ya fue contactado en los ultimos **30 dias**
- Si ya fue contactado recientemente, lo salta
- Actualiza la tabla en cada ejecucion con los nuevos datos

#### PASO 3: Deteccion de oportunidades (+5 clicks)
- **Umbral**: 5+ clicks en campanas recientes = **OPORTUNIDAD DE VENTA**
- Clasificacion por nivel de urgencia:
  - **HOT** (10+ clicks): contactar HOY
  - **WARM** (5-9 clicks): contactar esta semana
- Cruce con **Teachable**: tiene cursos? estan expirados? -> oportunidad de renovacion
- Cruce con **Stripe**: ha comprado antes? cuanto gasto? -> personalizar oferta

#### PASO 4: Cruce con Calendly - Hay telefono?
- Consulta eventos agendados del lead en Calendly
- Extrae telefono de `questions_and_answers` o `text_reminder_number`
- **Si hay telefono**: envia mensaje de WhatsApp personalizado via UltraMsg
  - Tono cercano, personalizado
  - Objetivo: agendar llamada con Lucia (comercial)
- Tambien busca telefono en Stripe y en los campos de MailerLite

#### PASO 5: Sin telefono - Email personalizado
- Si no se encuentra telefono en ninguna fuente
- Se marca el lead para envio de email personalizado
- Objetivo: pedir telefono para agendar llamada

---

## Aplicaciones y servicios integrados

| Servicio | Uso | API |
|----------|-----|-----|
| **MailerLite** | Email marketing. Fuente principal de datos de actividad (campanas, clicks, suscriptores) | `connect.mailerlite.com/api` |
| **Supabase** | Base de datos PostgreSQL. Almacena leads procesados, evita duplicados y trackea estado | Self-hosted REST API |
| **Teachable** | Plataforma de cursos online. Verifica si el lead tiene cursos comprados o expirados | `developers.teachable.com/v1` |
| **Stripe** | Procesador de pagos. Consulta historial de compras y monto total gastado por el lead | `api.stripe.com/v1` |
| **Calendly** | Agendamiento de citas. Busca eventos del lead y extrae numero de telefono | `api.calendly.com` |
| **UltraMsg** | API de WhatsApp. Envia mensajes personalizados a leads con telefono disponible | `api.ultramsg.com` |
| **Vercel** | Hosting serverless. Ejecuta la funcion de deteccion como API endpoint | Serverless Functions |
| **cron-job.org** | Cron externo gratuito. Dispara la ejecucion diaria a las 8:00 AM | HTTP GET |

---

## Campanas que analiza

El sistema revisa automaticamente todas las campanas enviadas en los ultimos 14 dias. Ejemplos de campanas actuales de la cuenta:

### Oposiciones de Justicia
- GB Regalo Justicia Tema 11 (series 1-6)
- Grupo destino: Opositores de Justicia (~4,000 suscriptores)

### Instituciones Penitenciarias
- IIPP Regalo Tips Trampa 2 (series 1-6)
- Grupo destino: Instituciones Penitenciarias (~912 suscriptores)

### Agente de Hacienda / Otras Oposiciones
- GB Manual Leyes Regalo LGP (series 1-4)
- GB Temarios Leyes
- Grupo destino: Otras Oposiciones (~9,158) + Agente de Hacienda (~363)

### Examen de Acceso a la Abogacia
- Examen de Abogacia Abel (varias versiones)
- Grupo destino: examen de abogacia (~5,200 suscriptores)

### Packs de Estudio
- Pack Cuatrimestre / Pack Cuatrimestre Abel
- Grupo destino: derecho virtual (~15,700 suscriptores)

### Directos y Eventos
- MG Directo caso laboral
- Grupo destino: segmento OPOSICIONES DE JUSTICIA

### Recursos Gratuitos
- Guia Gratis Procesal Penal (Abel)
- Derecho Procesal GRATIS (Abel)

**Cuenta**: Derecho Virtual (carlosrivero@derechovirtual.org)
**Total de suscriptores activos**: ~30,000+

---

## Estructura del proyecto

```
api/
  cron/
    detect-leads.js    # Endpoint principal - flujo completo de deteccion
  health.js            # Health check (GET /api/health)
lib/
  config.js            # Configuracion centralizada (env vars + umbrales)
  mailerlite.js        # Cliente API MailerLite (campanas + subscriber activity)
  supabase.js          # Cliente Supabase (CRUD tabla leads_mailerlite)
  teachable.js         # Cliente API Teachable (buscar cursos del lead)
  stripe-client.js     # Cliente API Stripe (historial de pagos)
  calendly.js          # Cliente API Calendly (eventos + extraccion telefono)
  ultramsg.js          # Cliente UltraMsg (envio WhatsApp + templates mensaje)
vercel.json            # Config Vercel (maxDuration)
package.json           # Dependencias
```

---

## Tabla Supabase: leads_mailerlite

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | BIGSERIAL | ID autoincremental |
| `email` | TEXT (UNIQUE) | Email del lead |
| `nombre` | TEXT | Nombre del suscriptor |
| `apellido` | TEXT | Apellido |
| `telefono` | TEXT | Telefono (de Calendly, Stripe o MailerLite) |
| `clicks_totales` | INTEGER | Clicks acumulados en campanas recientes |
| `campanas_clickeadas` | TEXT[] | Array con nombres de campanas donde hizo click |
| `nivel_urgencia` | TEXT | `hot` (10+) / `warm` (5-9) / `cold` |
| `tiene_cursos_teachable` | BOOLEAN | Si tiene cursos en Teachable |
| `cursos_teachable` | JSONB | Detalle de cursos (id, nombre, % completado) |
| `tiene_pagos_stripe` | BOOLEAN | Si ha pagado en Stripe |
| `total_gastado_stripe` | NUMERIC | Total gastado en EUR/USD |
| `tiene_evento_calendly` | BOOLEAN | Si tiene eventos en Calendly |
| `canal_contacto` | TEXT | `whatsapp` / `email` / `pendiente` |
| `estado` | TEXT | `nuevo` / `contactado` / `convertido` / `descartado` |
| `fecha_primera_deteccion` | TIMESTAMPTZ | Cuando se detecto por primera vez |
| `fecha_ultimo_contacto` | TIMESTAMPTZ | Ultima vez que se le contacto |
| `fecha_actualizacion` | TIMESTAMPTZ | Ultima actualizacion del registro |

---

## Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/health` | Health check - verifica que el servicio esta activo |
| GET | `/api/cron/detect-leads` | Ejecuta el flujo completo de deteccion de leads |

---

## Variables de entorno

| Variable | Servicio |
|----------|----------|
| `MAILERLITE_API_KEY` | API key de MailerLite |
| `SUPABASE_URL` | URL de la instancia Supabase |
| `SUPABASE_KEY` | Service role key de Supabase |
| `TEACHABLE_API_KEY` | API key de Teachable |
| `STRIPE_SECRET_KEY` | Secret key de Stripe |
| `CALENDLY_TOKEN` | Personal Access Token de Calendly |
| `CALENDLY_ORG_URI` | URI de la organizacion en Calendly |
| `CALENDLY_USER_URI` | URI del usuario en Calendly |
| `ULTRAMSG_TOKEN` | Token de UltraMsg (WhatsApp) |
| `ULTRAMSG_INSTANCE` | ID de instancia de UltraMsg |
| `CRON_SECRET` | (Opcional) Secret para proteger el endpoint cron |

---

## Configuracion del Cron

El cron se configura en **cron-job.org** (servicio externo gratuito) ya que Vercel Free no soporta crons nativos.

| Campo | Valor |
|-------|-------|
| Title | Deteccion Leads Calientes MailerLite |
| URL | `https://leads-calientes-mailerlite.vercel.app/api/cron/detect-leads` |
| Schedule | Every day at 8:00 (America/Bogota) |
| Crontab | `0 8 * * *` |

---

## Umbrales configurables

Definidos en `lib/config.js`:

- **lookbackDays**: 14 dias (periodo de campanas a analizar)
- **clickThreshold**: 5 clicks minimos para considerar lead caliente
- **cooldownDays**: 30 dias de enfriamiento antes de re-contactar

---

## Ejemplo de ejecucion

```json
{
  "success": true,
  "duration": "45.2s",
  "campaigns_analyzed": 18,
  "hot_leads_found": 12,
  "results": {
    "processed": 10,
    "skipped": 2,
    "whatsapp_sent": 4,
    "email_pending": 6,
    "errors": 0
  }
}
```

---

## Despliegue

- **Hosting**: Vercel (plan gratuito)
- **URL**: https://leads-calientes-mailerlite.vercel.app
- **Repo**: https://github.com/Proyectos-DerechoVirtual/automatizacion-detecci-n-leads-calientes-mailerlite
