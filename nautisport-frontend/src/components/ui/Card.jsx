// Contenedor de sección estilo "formulario de taller":
// default → blanco con borde gris | highlight → fondo amarillo suave (para servicios / alertas)
export default function Card({ title, variant = 'default', className = '', children }) {
  const estilos = {
    default: 'border-gray-300 bg-white',
    highlight: 'border-yellow-300 bg-yellow-50',
  };
  return (
    <section className={`border p-4 rounded ${estilos[variant] || estilos.default} ${className}`}>
      {title && (
        <h2 className="text-lg font-bold uppercase text-black mb-3 border-b border-gray-300 pb-1">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
