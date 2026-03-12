import { config } from './config.js';

const UA = 'LeadsCalientes/1.0';

// Fetch con timeout de 3 segundos
async function fetchWithTimeout(url, options, timeoutMs = 3000) {
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

// Enriquecer lead con datos de Teachable
export async function enrichWithTeachable(email) {
  try {
    const url = `${config.teachable.baseUrl}/users?email=${encodeURIComponent(email)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        'apiKey': config.teachable.apiKey,
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.log(`[Teachable] ${res.status} for ${email}`);
      return { tiene_cursos: false, cursos: [], userId: null };
    }
    const data = await res.json();
    if (!data.users || data.users.length === 0) {
      return { tiene_cursos: false, cursos: [], userId: null };
    }

    const user = data.users[0];
    return {
      tiene_cursos: true,
      cursos: [{ id: user.id, name: user.name || user.email }],
      userId: user.id,
    };
  } catch (err) {
    console.log(`[Teachable] Error for ${email}: ${err.message}`);
    return { tiene_cursos: false, cursos: [], userId: null };
  }
}
