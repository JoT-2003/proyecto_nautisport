'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { useAuth } from '@/hooks/useAuth';

// Marco de la aplicación con control de sesión:
// valida el token con /api/auth/me y redirige a /login si no hay sesión.
export default function AppShell({ children }) {
  const { usuario, cargando, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && !usuario) {
      router.replace('/login');
    }
  }, [cargando, usuario, router]);

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600 font-bold">Verificando sesión...</p>
      </div>
    );
  }

  if (!usuario) return null; // Redirigiendo al login

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Sidebar
        usuario={usuario}
        onLogout={() => {
          logout();
          router.replace('/login');
        }}
      />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
