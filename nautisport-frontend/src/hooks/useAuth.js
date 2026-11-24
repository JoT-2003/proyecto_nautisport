'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/services/api';
import { NS_TOKEN, NS_USUARIO, guardarSesion, limpiarSesion } from '@/lib/sesion';

// Reexportado por compatibilidad con imports antiguos.
export { NS_TOKEN, NS_USUARIO, limpiarSesion };

/**
 * Hook de sesión: valida el token contra la Edge Function (GET /auth/me)
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
        if (err.response?.status === 401 || err.response?.status === 403) limpiarSesion();
        setUsuario(null);
      })
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth', { email, password });
    guardarSesion(res.data);
    setUsuario(res.data.usuario);
    return res.data.usuario;
  }, []);

  const logout = useCallback(() => {
    limpiarSesion();
    setUsuario(null);
  }, []);

  return { usuario, cargando, login, logout };
}
