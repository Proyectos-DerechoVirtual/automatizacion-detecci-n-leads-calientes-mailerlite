import { config } from './config.js';

const UA = 'LeadsCalientes/1.0';

// Buscar usuario en Teachable por email
export async function findUserByEmail(email) {
  try {
    const url = `${config.teachable.baseUrl}/users?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: {
        'apiKey': config.teachable.apiKey,
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.log(`Teachable ${res.status} for ${email}`);
      return null;
    }
    const data = await res.json();
    if (!data.users || data.users.length === 0) return null;
    return data.users[0];
  } catch (err) {
    console.log(`Teachable error for ${email}:`, err.message);
    return null;
  }
}

// Enriquecer lead con datos de Teachable (sin buscar cursos para ahorrar tiempo)
export async function enrichWithTeachable(email) {
  const user = await findUserByEmail(email);
  if (!user) {
    return { tiene_cursos: false, cursos: [], userId: null };
  }

  return {
    tiene_cursos: true,
    cursos: [{ id: user.id, name: user.name || user.email }],
    userId: user.id,
  };
}
