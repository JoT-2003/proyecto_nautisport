import axios from 'axios';
import { NS_TOKEN } from '@/hooks/useAuth';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
});

// Adjunta el token JWT a todas las peticiones (si hay sesión activa)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(NS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Ante un 401 (sesión expirada/inválida) redirige al login.
// Se excluyen las llamadas a /auth para no redirigir en un login fallido.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const esLlamadaAuth = error.config?.url?.includes('/auth');
    if (
      typeof window !== 'undefined' &&
      error.response?.status === 401 &&
      !esLlamadaAuth &&
      !window.location.pathname.startsWith('/login')
    ) {
      localStorage.removeItem(NS_TOKEN);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
