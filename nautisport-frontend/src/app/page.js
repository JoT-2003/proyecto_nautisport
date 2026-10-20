'use client';
import { useState, useEffect } from 'react';
import api from '../services/api';

export default function RecepcionPage() {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorServicios, setErrorServicios] = useState(false);

  // Estados del Formulario
  const [cliente, setCliente] = useState({ nombre: '', telefono: '+569', email: '' });
  const [equipo, setEquipo] = useState({ tipo: 'Ski', marca_modelo: '', peso: '', fijaciones: '', zapatos: '' });
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState([]);
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [folioFisico, setFolioFisico] = useState('');
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    // Cargar catálogo de servicios desde la base de datos
    api.get('/servicios')
      .then(res => {
        setServicios(res.data);
        setErrorServicios(false);
      })
      .catch(err => {
        console.error('Error al cargar servicios:', err);
        setErrorServicios(true);
      });
  }, []);

  const handleServiceChange = (id) => {
    if (serviciosSeleccionados.includes(id)) {
      setServiciosSeleccionados(serviciosSeleccionados.filter(sId => sId !== id));
    } else {
      setServiciosSeleccionados([...serviciosSeleccionados, id]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje('');

    try {
      // 1. Registrar cliente (RF-01)
      const resCliente = await api.post('/clientes', cliente);
      const id_cliente = resCliente.data.id_cliente;

      // 2. Generar Orden de Trabajo (RF-02)
      const resOT = await api.post('/ordenes', {
        id_cliente,
        equipo,
        fecha_entrega_estimada: fechaEntrega,
        servicios: serviciosSeleccionados,
        observaciones,
        folio_fisico: folioFisico || null
      });

      setMensaje(`¡Orden N° ${resOT.data.id_orden} registrada exitosamente!`);
      
      // Limpiar formulario
      setCliente({ nombre: '', telefono: '+569', email: '' });
      setEquipo({ tipo: 'Ski', marca_modelo: '', peso: '', fijaciones: '', zapatos: '' });
      setServiciosSeleccionados([]);
      setObservaciones('');
      setFolioFisico('');
    } catch (error) {
      console.error(error);
      setMensaje(error.response?.data?.error || 'Error al procesar la recepción');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center text-gray-900">
      <div className="max-w-3xl w-full bg-white shadow-xl rounded-lg border border-gray-300 p-8">
        
        {/* Cabecera */}
        <div className="border-b-2 border-black pb-4 mb-6 text-center">
          <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">Taller de Ski y Snowboard</h1>
          <p className="text-base font-bold text-gray-700">NautiSport - Recepción de Equipos</p>
        </div>

        {mensaje && (
          <div className="mb-6 p-4 rounded bg-blue-100 text-blue-900 font-bold text-center border border-blue-400">
            {mensaje}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Folio y Fecha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded border border-gray-300">
            <div>
              <label className="block text-sm font-bold uppercase text-black mb-1">Folio Físico (N° Talonario):</label>
              <input 
                type="text" 
                placeholder="Ej: 01920" 
                value={folioFisico} 
                onChange={e => setFolioFisico(e.target.value)}
                className="w-full border border-gray-400 bg-white text-black p-2 rounded text-lg font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-bold uppercase text-black mb-1">Fecha Estimada de Entrega *:</label>
              <input 
                type="date" 
                required 
                value={fechaEntrega} 
                onChange={e => setFechaEntrega(e.target.value)}
                className="w-full border border-gray-400 bg-white text-black p-2 rounded text-lg font-bold focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          {/* 1. Datos del Cliente */}
          <div className="border border-gray-300 p-4 rounded bg-white">
            <h2 className="text-lg font-bold uppercase text-black mb-3 border-b pb-1">1. Datos del Cliente</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Nombre Completo *:</label>
                <input 
                  type="text" required placeholder="Juan Pérez" value={cliente.nombre} 
                  onChange={e => setCliente({...cliente, nombre: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Teléfono (+569) *:</label>
                <input 
                  type="text" required placeholder="+56912345678" value={cliente.telefono} 
                  onChange={e => setCliente({...cliente, telefono: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Correo Electrónico:</label>
                <input 
                  type="email" placeholder="juan@email.com" value={cliente.email} 
                  onChange={e => setCliente({...cliente, email: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
            </div>
          </div>

          {/* 2. Datos del Equipo */}
          <div className="border border-gray-300 p-4 rounded bg-white">
            <h2 className="text-lg font-bold uppercase text-black mb-3 border-b pb-1">2. Datos del Equipo</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Tipo de Equipo *:</label>
                <select 
                  value={equipo.tipo} 
                  onChange={e => setEquipo({...equipo, tipo: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded font-bold"
                >
                  <option value="Ski">Ski</option>
                  <option value="Snowboard">Snowboard</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Marca / Modelo *:</label>
                <input 
                  type="text" required placeholder="Ej: Dynafit" value={equipo.marca_modelo} 
                  onChange={e => setEquipo({...equipo, marca_modelo: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Peso (kg) / Ajuste:</label>
                <input 
                  type="number" placeholder="80" value={equipo.peso} 
                  onChange={e => setEquipo({...equipo, peso: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Fijaciones:</label>
                <input 
                  type="text" placeholder="Ej: Look Pivot" value={equipo.fijaciones} 
                  onChange={e => setEquipo({...equipo, fijaciones: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Zapatos / Botas:</label>
                <input 
                  type="text" placeholder="Ej: Salomon X-Pro" value={equipo.zapatos} 
                  onChange={e => setEquipo({...equipo, zapatos: e.target.value})}
                  className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium" 
                />
              </div>
            </div>
          </div>

          {/* 3. Selección de Servicios */}
          <div className="border border-yellow-300 p-4 rounded bg-yellow-50">
            <h2 className="text-lg font-bold uppercase text-black mb-3">3. Servicios Requeridos</h2>
            
            {errorServicios ? (
              <p className="text-red-600 font-bold text-sm bg-red-50 p-3 rounded border border-red-300">
                ⚠️ No se pudo conectar con el servidor backend (puerto 4000). Asegúrate de tener corriendo 'npx nodemon index.js'.
              </p>
            ) : servicios.length === 0 ? (
              <p className="text-gray-700 font-semibold text-sm">Cargando catálogo de servicios desde la base de datos...</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {servicios.map((s) => (
                  <label key={s.id_servicio} className="flex items-center space-x-2 bg-white p-3 rounded border border-gray-300 cursor-pointer hover:bg-yellow-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={serviciosSeleccionados.includes(s.id_servicio)} 
                      onChange={() => handleServiceChange(s.id_servicio)}
                      className="w-5 h-5 accent-black"
                    />
                    <span className="font-bold text-black text-sm">{s.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-800 mb-1">Observaciones / Arreglos Diversos:</label>
            <textarea 
              rows="3" value={observaciones} 
              onChange={e => setObservaciones(e.target.value)}
              className="w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium"
              placeholder="Detalles sobre el estado del equipo..."
            ></textarea>
          </div>

          {/* Botón de Envío */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-lg font-bold text-lg uppercase tracking-wider hover:bg-gray-800 transition-colors shadow-md"
          >
            {loading ? 'Procesando...' : 'Guardar Orden de Trabajo'}
          </button>
        </form>

      </div>
    </div>
  );
}