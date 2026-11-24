'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

// Usuarios creados por scripts/seed_usuario.js (solo para la demo)
const DEMO_USUARIOS = [
  { rol: 'Administrador', email: 'admin@nautisport.cl' },
  { rol: 'Recepción', email: 'recepcion@nautisport.cl' },
  { rol: 'Técnico', email: 'tecnico@nautisport.cl' },
];
const DEMO_PASSWORD = 'nautisport123';

export default function LoginPage() {
  const router = useRouter();
  const { usuario, cargando, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesión válida, ir directo al panel
  useEffect(() => {
    if (!cargando && usuario) {
      router.replace('/');
    }
  }, [cargando, usuario, router]);

  // Rellena el formulario con una cuenta de demostración
  const usarDemo = (email) => {
    setEmail(email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        (!err.response
          ? 'No se pudo conectar con el servidor. Verifica que la Edge Function "api" esté desplegada en Supabase y que NEXT_PUBLIC_API_URL apunte a ella.'
          : 'No se pudo iniciar sesión')
      );
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="text-center mb-6">
          <i className="fa-solid fa-person-skiing text-5xl text-black" aria-hidden="true" />
          <h1 className="mt-2 text-2xl font-extrabold uppercase tracking-wider text-black">NautiSport</h1>
          <p className="text-sm font-bold text-gray-700">Taller de Ski y Snowboard</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white shadow-xl rounded-lg border border-gray-300 p-6 space-y-4">
          <h2 className="text-lg font-bold uppercase text-black border-b-2 border-black pb-2">Iniciar Sesión</h2>

          {error && (
            <div className="p-3 rounded bg-red-100 text-red-900 font-bold text-sm border border-red-400">
              {error}
            </div>
          )}

          <Input
            label="Correo Electrónico"
            name="email"
            type="email"
            required
            placeholder="usuario@nautisport.cl"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <Button type="submit" loading={enviando} className="w-full">
            Entrar
          </Button>

          {/* Credenciales de demostración (clic para rellenar el formulario) */}
          <div className="bg-gray-50 border border-gray-300 rounded p-3 text-xs text-gray-700">
            <p className="font-bold uppercase text-gray-800 mb-2">Usuarios de demostración</p>
            <div className="space-y-1">
              {DEMO_USUARIOS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => usarDemo(u.email)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded border border-transparent hover:border-black hover:bg-white transition-colors"
                >
                  <span>
                    <span className="font-bold text-black">{u.rol}</span>
                    <span className="block text-gray-600">{u.email}</span>
                  </span>
                  <span className="font-bold uppercase text-[10px] bg-black text-white px-2 py-1 rounded shrink-0">
                    Usar
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2">
              Contraseña para todos: <span className="font-mono font-bold">{DEMO_PASSWORD}</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
