'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { formatearPrecio } from '@/lib/validaciones';
import TarjetaOT from '@/components/taller/TarjetaOT';
import ModalAgregarServicio from '@/components/taller/ModalAgregarServicio';

// Columnas del tablero (los estados 'Entregado' quedan en el historial de Órdenes)
const COLUMNAS = [
  { estado: 'Pendiente', borde: 'border-t-gray-500' },
  { estado: 'En Mantención', borde: 'border-t-blue-500' },
  { estado: 'Requiere Autorización', borde: 'border-t-red-500' },
  { estado: 'Finalizado', borde: 'border-t-green-600' },
];

export default function TallerPage() {
  const { usuario } = useAuth();

  const [ordenes, setOrdenes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [accionEnCurso, setAccionEnCurso] = useState(null); // ej: "Finalizado:12"
  const [ordenModal, setOrdenModal] = useState(null); // OT para el modal de servicio

  const esTecnico = usuario?.rol === 'Tecnico';

  const cargar = useCallback(async () => {
    try {
      const [resOrdenes, resServicios] = await Promise.all([
        api.get('/ordenes'),
        api.get('/servicios'),
      ]);
      setOrdenes(resOrdenes.data);
      setServicios(resServicios.data);
      setError(false);
    } catch (err) {
      console.error('Error al cargar el tablero:', err);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Agrupar por estado (la consulta ya viene ordenada por id DESC)
  const porEstado = useMemo(() => {
    const grupos = {};
    for (const col of COLUMNAS) {
      grupos[col.estado] = ordenes.filter(o => o.estado === col.estado);
    }
    return grupos;
  }, [ordenes]);

  const cambiarEstado = async (orden, estado, comentario) => {
    setAccionEnCurso(`${estado}:${orden.id_orden}`);
    setMensaje(null);
    try {
      await api.patch(`/ordenes/${orden.id_orden}/estado`, {
        estado,
        // El técnico se autoasigna al iniciar la mantención
        ...(esTecnico && estado === 'En Mantención' && orden.estado === 'Pendiente'
          ? { id_tecnico_asignado: usuario.id_usuario }
          : {}),
        comentario,
      });
      setMensaje({ tipo: 'ok', texto: `OT #${orden.id_orden} actualizada a "${estado}"` });
      await cargar();
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'Error al actualizar la orden de trabajo',
      });
    } finally {
      setAccionEnCurso(null);
    }
  };

  const iniciarMantencion = (orden) => cambiarEstado(orden, 'En Mantención', 'Mantención iniciada');
  const finalizar = (orden) => cambiarEstado(orden, 'Finalizado', 'Trabajo finalizado');
  const entregar = (orden) => cambiarEstado(orden, 'Entregado', 'Equipo entregado al cliente');
  const aprobarSobrecosto = (orden) => cambiarEstado(orden, 'En Mantención', 'Sobrecosto autorizado por el cliente');
  const rechazarSobrecosto = (orden) => cambiarEstado(orden, 'Finalizado', 'Sobrecosto rechazado por el cliente');

  // Al agregar un servicio desde el modal
  const alAgregarServicio = async (data) => {
    const idOrden = ordenModal?.id_orden;
    setOrdenModal(null);
    const requiereAutorizacion = data.estado === 'Requiere Autorización';
    setMensaje({
      tipo: 'ok',
      texto: `Servicio agregado a OT #${idOrden}. Nuevo total: ${formatearPrecio(data.monto_total)}${
        requiereAutorizacion ? ' — requiere autorización del cliente' : ''
      }`,
    });
    await cargar();
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">Taller</h1>
        <p className="text-base font-bold text-gray-700">
          Tablero de producción — {esTecnico ? 'vista del técnico' : 'avance y autorización de órdenes'}
        </p>
      </div>

      {mensaje && (
        <div className={`mb-6 p-4 rounded font-bold border ${
          mensaje.tipo === 'ok'
            ? 'bg-green-100 text-green-900 border-green-400'
            : 'bg-red-100 text-red-900 border-red-400'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded bg-red-100 text-red-900 font-bold border border-red-400">
          <i className="fa-solid fa-triangle-exclamation mr-2" aria-hidden="true" />
          No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.
        </div>
      )}

      {cargando ? (
        <p className="text-gray-700 font-semibold">Cargando tablero de producción...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNAS.map(col => (
            <section
              key={col.estado}
              className={`bg-gray-50 border border-gray-300 border-t-4 ${col.borde} rounded-lg p-3`}
            >
              <h2 className="flex items-center justify-between text-sm font-extrabold uppercase text-black mb-3 gap-2">
                <span>{col.estado}</span>
                <span className="bg-black text-white text-xs px-2 py-0.5 rounded-full">
                  {porEstado[col.estado]?.length ?? 0}
                </span>
              </h2>
              <div className="space-y-3">
                {porEstado[col.estado]?.length === 0 ? (
                  <p className="text-xs text-gray-400 font-semibold text-center py-4">Sin órdenes</p>
                ) : (
                  porEstado[col.estado].map(orden => (
                    <TarjetaOT
                      key={orden.id_orden}
                      orden={orden}
                      usuario={usuario}
                      accionEnCurso={accionEnCurso}
                      onIniciar={iniciarMantencion}
                      onFinalizar={finalizar}
                      onEntregar={entregar}
                      onAprobar={aprobarSobrecosto}
                      onRechazar={rechazarSobrecosto}
                      onAgregarServicio={setOrdenModal}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {ordenModal && (
        <ModalAgregarServicio
          orden={ordenModal}
          servicios={servicios}
          onClose={() => setOrdenModal(null)}
          onAgregado={alAgregarServicio}
        />
      )}
    </div>
  );
}
