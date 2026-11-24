// Colores por estado de la Orden de Trabajo (estado_ot_enum en PostgreSQL)
const ESTILOS_ESTADO = {
  'Pendiente': 'bg-gray-200 text-gray-800 border-gray-400',
  'En Mantención': 'bg-blue-100 text-blue-900 border-blue-400',
  'Requiere Autorización': 'bg-red-100 text-red-800 border-red-400',
  'Finalizado': 'bg-green-100 text-green-800 border-green-500',
  'Entregado': 'bg-gray-100 text-gray-500 border-gray-300',
};

export default function Badge({ estado, className = '' }) {
  const estilo = ESTILOS_ESTADO[estado] || 'bg-gray-100 text-gray-700 border-gray-300';
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold whitespace-nowrap ${estilo} ${className}`}
    >
      {estado}
    </span>
  );
}
