import { config } from './config.js';

// Buscar usuario en Teachable por email
export async function findUserByEmail(email) {
  try {
    const url = `${config.teachable.baseUrl}/users?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: { 'apiKey': config.teachable.apiKey },
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.users || data.users.length === 0) return null;

    return data.users[0];
  } catch (err) {
    console.log(`Teachable error for ${email}:`, err.message);
    return null;
  }
}

// Obtener cursos de un usuario en Teachable
export async function getUserCourses(userId) {
  try {
    const url = `${config.teachable.baseUrl}/users/${userId}/courses`;
    const res = await fetch(url, {
      headers: { 'apiKey': config.teachable.apiKey },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.courses || [];
  } catch (err) {
    console.log(`Teachable courses error for user ${userId}:`, err.message);
    return [];
  }
}

// Enriquecer lead con datos de Teachable
export async function enrichWithTeachable(email) {
  const user = await findUserByEmail(email);
  if (!user) {
    return { tiene_cursos: false, cursos: [], userId: null };
  }

  const courses = await getUserCourses(user.id);

  return {
    tiene_cursos: courses.length > 0,
    cursos: courses.map(c => ({
      id: c.id,
      name: c.name,
      completed: c.completed || false,
      percent_complete: c.percent_complete || 0,
    })),
    userId: user.id,
  };
}
