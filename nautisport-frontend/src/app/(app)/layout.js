import AppShell from '@/components/layout/AppShell';

// Todas las páginas de la app viven dentro de este grupo de rutas,
// de modo que compartan el layout con navegación (el futuro /login irá fuera).
export default function AppLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
