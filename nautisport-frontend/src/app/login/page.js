'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      console.error('Error de login:', err);
      setError(
        err.response?.data?.error ||
        (!err.response
          ? 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.'
          : 'No se pudo iniciar sesión. Verifica tu correo y contraseña.')
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
        </form>
      </div>
    </div>
  );
}
