'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Elementos del menú (visibilidad por rol).
// `disabled` = módulo aún no desarrollado (Fase 7)
const MENU = [
  { href: '/', label: 'Inicio', icono: 'fa-house', roles: ['Administrador', 'Recepcion', 'Tecnico'] },
  { href: '/recepcion', label: 'Recepción', icono: 'fa-pen-to-square', roles: ['Administrador', 'Recepcion'] },
  { href: '/ordenes', label: 'Órdenes', icono: 'fa-clipboard-list', roles: ['Administrador', 'Recepcion', 'Tecnico'] },
  { href: '/taller', label: 'Taller', icono: 'fa-screwdriver-wrench', roles: ['Administrador', 'Recepcion', 'Tecnico'] },
  { href: '/servicios', label: 'Servicios', icono: 'fa-tags', roles: ['Administrador'] },
];

function Item({ item, activo }) {
  const base =
    'flex items-center gap-2 px-3 py-2 rounded font-bold text-sm whitespace-nowrap transition-colors';
  if (item.disabled) {
    return (
      <span
        className={`${base} text-gray-400 cursor-not-allowed`}
        title="Módulo en desarrollo"
      >
        <i className={`fa-solid ${item.icono} w-4 text-center`} aria-hidden="true" />
        {item.label}
        <span className="text-[10px] uppercase bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Pronto</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={`${base} ${
        activo
          ? 'bg-white text-black shadow-sm'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <i className={`fa-solid ${item.icono} w-4 text-center`} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

// Etiqueta legible de cada rol
const ROL_LABEL = {
  Administrador: 'Administrador',
  Recepcion: 'Recepción',
  Tecnico: 'Técnico',
};

export default function Sidebar({ usuario, onLogout }) {
  const pathname = usePathname();

  return (
    <header className="bg-black border-b-4 border-yellow-400 print:hidden">
      <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3">
        {/* Logo / Marca */}
        <Link href="/" className="flex items-center gap-2 md:mr-6">
          <i className="fa-solid fa-person-skiing text-xl text-yellow-400" aria-hidden="true" />
          <span className="text-white font-extrabold uppercase tracking-wider text-lg leading-none">
            NautiSport
            <span className="block text-[10px] font-bold text-gray-400 tracking-normal normal-case">
              Taller de Ski y Snowboard
            </span>
          </span>
        </Link>

        {/* Navegación (horizontal en móvil, barra en desktop) */}
        <nav className="flex gap-1 overflow-x-auto md:overflow-visible" aria-label="Navegación principal">
          {MENU.filter(item => !usuario || item.roles.includes(usuario.rol)).map((item) => (
            <Item key={item.href} item={item} activo={pathname === item.href} />
          ))}
        </nav>

        {/* Usuario autenticado */}
        {usuario && (
          <div className="flex items-center gap-3 md:ml-auto">
            <div className="text-right leading-tight">
              <p className="text-white text-sm font-bold">{usuario.nombre}</p>
              <p className="text-[10px] uppercase font-bold text-yellow-400">
                {ROL_LABEL[usuario.rol] || usuario.rol}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 bg-white text-black text-xs font-bold uppercase px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
