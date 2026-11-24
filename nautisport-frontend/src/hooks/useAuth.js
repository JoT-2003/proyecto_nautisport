'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/services/api';

// Claves de sesión en localStorage
export const NS_TOKEN = 'ns_token';
export const NS_USUARIO = 'ns_usuario';

export function limpiarSesion() {
  localStorage.removeItem(NS_TOKEN);
  localStorage.removeItem(NS_USUARIO);
}

/**
 * Hook de sesión: valida el token contra el backend (GET /auth/me)
 * y expone login/logout para toda la app.
 */
export function useAuth() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(NS_TOKEN);
    if (!token) {
      setCargando(false);
      return;
    }
    // Mostrar el usuario guardado de inmediato y validar contra el backend
    const guardado = localStorage.getItem(NS_USUARIO);
    if (guardado) {
      try { setUsuario(JSON.parse(guardado)); } catch { /* JSON inválido, se ignora */ }
    }
    api.get('/auth/me')
      .then(res => setUsuario(res.data))
      .catch(err => {
        if (err.response?.status === 401) limpiarSesion();
        setUsuario(null);
      })
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth', { email, password });
    localStorage.setItem(NS_TOKEN, res.data.token);
    localStorage.setItem(NS_USUARIO, JSON.stringify(res.data.usuario));
    setUsuario(res.data.usuario);
    return res.data.usuario;
  }, []);

  const logout = useCallback(() => {
    limpiarSesion();
    setUsuario(null);
  }, []);

  return { usuario, cargando, login, logout };
}
