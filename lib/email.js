import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Generar email personalizado segun el lead
function buildEmailContent(lead) {
  const nombre = lead.nombre || lead.apellido || 'amigo/a';

  // Determinar producto de interes
  let producto = 'nuestros recursos';
  const campanas = (lead.campanas_clickeadas || []).join(' ').toLowerCase();

  if (campanas.includes('justicia')) producto = 'las oposiciones de Justicia';
  else if (campanas.includes('iipp') || campanas.includes('penitenciari')) producto = 'Instituciones Penitenciarias';
  else if (campanas.includes('abogac')) producto = 'el Examen de Acceso a la Abogacia';
  else if (campanas.includes('hacienda')) producto = 'Agente de Hacienda';
  else if (campanas.includes('pack') || campanas.includes('cuatrimestre')) producto = 'nuestros packs de estudio';
  else if (campanas.includes('procesal')) producto = 'Derecho Procesal';
  else if (campanas.includes('leyes') || campanas.includes('lgp') || campanas.includes('temario')) producto = 'nuestros temarios y manuales de leyes';

  const subject = `${nombre}, tenemos algo especial para ti`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="padding: 20px;">
    <p>Hola ${nombre},</p>

    <p>Soy <strong>Lucia</strong>, del equipo de <strong>Derecho Virtual</strong>.</p>

    <p>He visto que llevas un tiempo interesandote por ${producto} y queria escribirte personalmente para ofrecerte algo exclusivo.</p>

    ${lead.tiene_cursos_teachable ? '<p>Ademas, ya formas parte de nuestra comunidad de estudiantes, asi que esto te va a interesar especialmente.</p>' : ''}

    <p>Nos gustaria <strong>llamarte 10 minutos</strong> para:</p>
    <ul>
      <li>Resolver cualquier duda que tengas</li>
      <li>Contarte una oferta exclusiva que hemos preparado</li>
      <li>Orientarte sobre el mejor camino para tu preparacion</li>
    </ul>

    <p><strong>¿Nos dejas tu telefono para llamarte?</strong> Solo tienes que responder a este email con tu numero.</p>

    <p>O si lo prefieres, puedes <strong>agendar directamente tu llamada gratuita</strong> en el horario que mejor te venga:</p>

    <p style="text-align: center; margin: 25px 0;">
      <a href="https://calendly.com/derecho-virtual" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Agendar mi llamada gratuita</a>
    </p>

    <p>¡Espero tu respuesta!</p>

    <p>Un abrazo,<br>
    <strong>Lucia</strong><br>
    Equipo Derecho Virtual</p>
  </div>

  <div style="border-top: 1px solid #eee; padding: 15px 20px; font-size: 12px; color: #999;">
    <p>Derecho Virtual - derechovirtual.org</p>
  </div>
</body>
</html>`;

  const text = `Hola ${nombre},

Soy Lucia, del equipo de Derecho Virtual.

He visto que llevas un tiempo interesandote por ${producto} y queria escribirte personalmente para ofrecerte algo exclusivo.

Nos gustaria llamarte 10 minutos para resolver tus dudas y contarte una oferta exclusiva.

¿Nos dejas tu telefono? Solo responde a este email con tu numero.

O agenda directamente tu llamada gratuita: https://calendly.com/derecho-virtual

Un abrazo,
Lucia
Equipo Derecho Virtual`;

  return { subject, html, text };
}

// Enviar email personalizado a un lead
export async function sendPersonalizedEmail(lead) {
  try {
    const { subject, html, text } = buildEmailContent(lead);
    const t = getTransporter();

    const info = await t.sendMail({
      from: `"Lucia - Derecho Virtual" <${process.env.SMTP_USER}>`,
      to: lead.email,
      subject,
      text,
      html,
      replyTo: process.env.SMTP_USER,
    });

    console.log(`[EMAIL] Enviado a ${lead.email}: ${info.messageId}`);
    return { sent: true, email: lead.email, messageId: info.messageId };
  } catch (err) {
    console.log(`[EMAIL] Error enviando a ${lead.email}:`, err.message);
    return { sent: false, email: lead.email, error: err.message };
  }
}

// Test de conexion SMTP
export async function testSmtpConnection() {
  try {
    const t = getTransporter();
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
