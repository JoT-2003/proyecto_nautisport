'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

const ACCIONES = [
  {
    href: '/recepcion',
    icono: 'fa-pen-to-square',
    titulo: 'Recepción de Equipos',
    descripcion: 'Registrar un nuevo cliente y generar su Orden de Trabajo (RF-01 / RF-02).',
    roles: ['Administrador', 'Recepcion'],
  },
  {
    href: '/ordenes',
    icono: 'fa-clipboard-list',
    titulo: 'Órdenes de Trabajo',
    descripcion: 'Consultar el estado de las OT activas y su trazabilidad (RF-03 / RF-04).',
    roles: ['Administrador', 'Recepcion', 'Tecnico'],
  },
  {
    href: '/taller',
    icono: 'fa-screwdriver-wrench',
    titulo: 'Taller',
    descripcion: 'Tablero de producción: avanzar estados, sobrecostos y entrega de equipos.',
    roles: ['Administrador', 'Recepcion', 'Tecnico'],
  },
  {
    href: '/servicios',
    icono: 'fa-tags',
    titulo: 'Catálogo de Servicios',
    descripcion: 'Administrar servicios y precios base por disciplina (Ski / Snowboard).',
    roles: ['Administrador'],
  },
];

const ROL_LABEL = {
  Administrador: 'Administrador',
  Recepcion: 'Recepción',
  Tecnico: 'Técnico',
};

export default function HomePage() {
  const { usuario } = useAuth();
  const visibles = ACCIONES.filter(a => !usuario || a.roles.includes(usuario.rol));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">
          Panel de Gestión
        </h1>
        <p className="text-base font-bold text-gray-700">
          NautiSport — Taller de Ski y Snowboard
        </p>
        {usuario && (
          <p className="text-sm font-semibold text-gray-600 mt-1">
            Hola, {usuario.nombre} · <span className="text-black">{ROL_LABEL[usuario.rol] || usuario.rol}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visibles.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="bg-white border border-gray-300 rounded-lg p-5 shadow-sm hover:shadow-md hover:border-black transition-all group flex flex-col items-center text-center"
          >
            <i className={`fa-solid ${a.icono} text-3xl text-black`} aria-hidden="true" />
            <h2 className="mt-2 text-lg font-bold uppercase text-black group-hover:underline">
              {a.titulo}
            </h2>
            <p className="mt-1 text-sm text-gray-600 font-medium">{a.descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
