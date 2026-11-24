// Claves y helpers de sesión compartidos por el hook de auth y el cliente API.

export const NS_TOKEN = 'ns_token';
export const NS_REFRESH = 'ns_refresh';
export const NS_USUARIO = 'ns_usuario';

export function guardarSesion({ token, refresh_token, usuario }) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(NS_TOKEN, token);
  if (refresh_token) localStorage.setItem(NS_REFRESH, refresh_token);
  if (usuario) localStorage.setItem(NS_USUARIO, JSON.stringify(usuario));
}

export function limpiarSesion() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(NS_TOKEN);
  localStorage.removeItem(NS_REFRESH);
  localStorage.removeItem(NS_USUARIO);
}
