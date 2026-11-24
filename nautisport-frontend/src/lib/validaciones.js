// Validaciones compartidas del lado cliente (Recepción)

// Formato telefónico chileno: +569 seguido de 8 dígitos (misma regla del backend)
export const REGEX_TELEFONO = /^\+569\d{8}$/;

export function validarTelefono(telefono) {
  if (!telefono || !telefono.trim()) {
    return 'El teléfono es obligatorio';
  }
  if (!REGEX_TELEFONO.test(telefono.trim())) {
    return 'Formato: +569 seguido de 8 dígitos (ej: +56912345678)';
  }
  return null; // válido
}

export function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return fechaISO;
  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Para timestamps completos de la BD (fecha_recepcion, historial, etc.)
export function formatearFechaHora(fechaISO) {
  if (!fechaISO) return '—';
  const fecha = new Date(fechaISO);
  if (Number.isNaN(fecha.getTime())) return fechaISO;
  return fecha.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatearPrecio(monto) {
  if (monto == null || Number.isNaN(Number(monto))) return '—';
  return `$${Number(monto).toLocaleString('es-CL')}`;
}
