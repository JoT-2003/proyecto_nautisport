// Tabla genérica.
// columnas: [{ key, label, render? }]  — render(fila) devuelve contenido custom
// filas: array de objetos
export default function Tabla({ columnas, filas, vacio = 'Sin registros', className = '' }) {
  return (
    <div className={`overflow-x-auto border border-gray-300 rounded bg-white ${className}`}>
      <table className="w-full text-sm text-left text-gray-900">
        <thead className="bg-black text-white uppercase text-xs tracking-wider">
          <tr>
            {columnas.map((col) => (
              <th key={col.key} scope="col" className="px-4 py-3 font-bold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas?.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="px-4 py-8 text-center text-gray-500 font-semibold">
                {vacio}
              </td>
            </tr>
          )}
          {filas?.map((fila, i) => (
            <tr key={fila.id ?? i} className="border-t border-gray-200 hover:bg-gray-50">
              {columnas.map((col) => (
                <td key={col.key} className="px-4 py-3 align-middle">
                  {col.render ? col.render(fila) : fila[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
