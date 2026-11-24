import axios from 'axios';
import {
  NS_TOKEN,
  NS_REFRESH,
  guardarSesion,
  limpiarSesion,
} from '@/lib/sesion';

// En producción debe apuntar a la Edge Function de Supabase:
//   https://TU_PROYECTO.supabase.co/functions/v1/api
// En desarrollo, si no hay variable, usa el backend Express local.
const baseURL = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:4000/api' : '')
).replace(/\/+$/, '');

if (!baseURL && typeof window !== 'undefined') {
  console.error(
    '[NautiSport] Falta NEXT_PUBLIC_API_URL. Configura en Vercel la URL de la ' +
      'Edge Function (https://TU_PROYECTO.supabase.co/functions/v1/api) y ' +
      'vuelve a desplegar.'
  );
}

const api = axios.create({ baseURL });

// Evita que varias peticiones simultáneas disparen varios refresh.
let refrescoEnCurso = null;

async function refrescarSesion() {
  if (refrescoEnCurso) return refrescoEnCurso;

  const refreshToken = localStorage.getItem(NS_REFRESH);
  if (!refreshToken) throw new Error('No hay refresh token');

  refrescoEnCurso = axios
    .post(`${baseURL}/auth/refresh`, { refresh_token: refreshToken })
    .then(({ data }) => {
      guardarSesion(data);
      return data.token;
    })
    .finally(() => {
      refrescoEnCurso = null;
    });

  return refrescoEnCurso;
}

// Adjunta el token JWT de Supabase a todas las peticiones.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(NS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Ante un 401 intenta renovar la sesión una vez y reintenta la petición.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Solo el POST /auth (login) queda fuera del refresh. /auth/me sí debe
    // intentar renovar el token cuando la sesión está vencida.
    const esLogin = original?.url?.split('?')[0] === '/auth';
    const es401 = error.response?.status === 401;

    if (es401 && !esLogin && !original?._reintento && typeof window !== 'undefined') {
      original._reintento = true;
      try {
        const nuevoToken = await refrescarSesion();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${nuevoToken}`;
        return api(original);
      } catch {
        // Si el refresh falla, la sesión ya no sirve.
      }
    }

    if (es401 && !esLogin && typeof window !== 'undefined') {
      limpiarSesion();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
