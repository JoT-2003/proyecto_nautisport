'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import api from '@/services/api';
import { Badge, Tabla, Input, Button, Modal } from '@/components/ui';
import { formatearFechaHora, formatearPrecio } from '@/lib/validaciones';
import { useAuth } from '@/hooks/useAuth';

const ESTADOS = ['Pendiente', 'En Mantención', 'Requiere Autorización', 'Finalizado', 'Entregado'];

export default function OrdenesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'Administrador';

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  // Eliminación (solo Administrador)
  const [ordenAEliminar, setOrdenAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState(null);
  const [aviso, setAviso] = useState(null);

  // Filtros
  const [estadoFiltro, setEstadoFiltro] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    setCargando(true);
    api.get('/ordenes')
      .then(res => {
        setOrdenes(res.data);
        setError(false);
      })
      .catch(err => {
        console.error('Error al cargar órdenes:', err);
        setError(true);
      })
      .finally(() => setCargando(false));
  }, []);

  // Conteo por estado para los chips de filtro
  const conteoPorEstado = useMemo(() => {
    const conteo = { Todas: ordenes.length };
    for (const estado of ESTADOS) {
      conteo[estado] = ordenes.filter(o => o.estado === estado).length;
    }
    return conteo;
  }, [ordenes]);

  // Filtrado combinado: estado + búsqueda libre
  const ordenesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return ordenes.filter(o => {
      const coincideEstado = estadoFiltro === 'Todas' || o.estado === estadoFiltro;
      if (!coincideEstado) return false;
      if (!texto) return true;
      const campos = [
        o.id_orden,
        o.folio_fisico,
        o.cliente_nombre,
        o.cliente_telefono,
        o.equipo_tipo,
        o.equipo_modelo,
      ];
      return campos.some(campo => String(campo ?? '').toLowerCase().includes(texto));
    });
  }, [ordenes, estadoFiltro, busqueda]);

  // Eliminar una OT (solo Administrador). El backend borra en cascada servicios e historial.
  const confirmarEliminar = async () => {
    if (!ordenAEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await api.delete(`/ordenes/${ordenAEliminar.id_orden}`);
      setOrdenes(prev => prev.filter(o => o.id_orden !== ordenAEliminar.id_orden));
      setAviso(
        `Orden Folio #${ordenAEliminar.folio_fisico || ordenAEliminar.id_orden} eliminada correctamente.`
      );
      setOrdenAEliminar(null);
    } catch (err) {
      console.error('Error al eliminar la orden:', err);
      setErrorEliminar(err.response?.data?.error || 'No se pudo eliminar la orden');
    } finally {
      setEliminando(false);
    }
  };

  const columnas = [
    {
      key: 'id_orden',
      label: 'N° OT',
      render: (o) => <span className="font-mono font-bold">#{o.id_orden}</span>,
    },
    {
      key: 'folio_fisico',
      label: 'Folio',
      render: (o) => o.folio_fisico || <span className="text-gray-400">—</span>,
    },
    {
      key: 'cliente_nombre',
      label: 'Cliente',
      render: (o) => (
        <>
          <span className="font-bold">{o.cliente_nombre}</span>
          <span className="block text-xs text-gray-500">{o.cliente_telefono}</span>
        </>
      ),
    },
    {
      key: 'equipo',
      label: 'Equipo',
      render: (o) => `${o.equipo_tipo} — ${o.equipo_modelo}`,
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (o) => <Badge estado={o.estado} />,
    },
    {
      key: 'monto_total',
      label: 'Total',
      render: (o) => <span className="font-bold">{formatearPrecio(o.monto_total)}</span>,
    },
    {
      key: 'fecha_recepcion',
      label: 'Recepción',
      render: (o) => formatearFechaHora(o.fecha_recepcion),
    },
    {
      key: 'acciones',
      label: '',
      render: (o) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/ordenes/${o.id_orden}`}
            className="inline-flex items-center gap-1.5 bg-black text-white px-3 py-1.5 rounded font-bold text-xs uppercase hover:bg-gray-800 transition-colors"
          >
            <i className="fa-solid fa-eye" aria-hidden="true" />
            Ver detalle
          </Link>
          {esAdmin && (
            <button
              type="button"
              onClick={() => {
                setErrorEliminar(null);
                setOrdenAEliminar(o);
              }}
              className="inline-flex items-center gap-1.5 bg-white text-red-700 border border-red-400 px-3 py-1.5 rounded font-bold text-xs uppercase hover:bg-red-50 transition-colors"
            >
              <i className="fa-solid fa-trash-can" aria-hidden="true" />
              Eliminar
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="border-b-2 border-black pb-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">Órdenes de Trabajo</h1>
          <p className="text-base font-bold text-gray-700">Consulta de OT activas e histórico (RF-03 / RF-04)</p>
        </div>
        <Link href="/recepcion">
          <Button>
            <i className="fa-solid fa-plus" aria-hidden="true" />
            Nueva Recepción
          </Button>
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded bg-red-100 text-red-900 font-bold border border-red-400">
          <i className="fa-solid fa-triangle-exclamation mr-2" aria-hidden="true" />
          No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.
        </div>
      )}

      {aviso && (
        <div className="mb-6 p-4 rounded bg-green-100 text-green-900 font-bold border border-green-400 flex items-start justify-between gap-4">
          <span>
            <i className="fa-solid fa-circle-check mr-2" aria-hidden="true" />
            {aviso}
          </span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="text-green-900 text-xl leading-none"
            aria-label="Cerrar aviso"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-2 mb-4">
        {['Todas', ...ESTADOS].map(estado => (
          <button
            key={estado}
            onClick={() => setEstadoFiltro(estado)}
            className={`px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wide transition-colors ${
              estadoFiltro === estado
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-800 border-gray-400 hover:border-black'
            }`}
          >
            {estado} ({conteoPorEstado[estado] ?? 0})
          </button>
        ))}
      </div>

      {/* Búsqueda libre */}
      <div className="mb-4 max-w-md">
        <Input
          name="busqueda"
          type="search"
          placeholder="Buscar por N° OT, folio, cliente, teléfono o equipo..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {cargando ? (
        <p className="text-gray-700 font-semibold">Cargando órdenes de trabajo...</p>
      ) : (
        <Tabla
          columnas={columnas}
          filas={ordenesFiltradas}
          vacio={error ? 'Sin conexión con el servidor' : 'No hay órdenes que coincidan con los filtros'}
        />
      )}

      {/* Confirmación de eliminación (solo Administrador) */}
      <Modal
        open={!!ordenAEliminar}
        onClose={() => {
          if (!eliminando) {
            setOrdenAEliminar(null);
            setErrorEliminar(null);
          }
        }}
        title="Eliminar orden de trabajo"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOrdenAEliminar(null);
                setErrorEliminar(null);
              }}
              disabled={eliminando}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarEliminar} loading={eliminando}>
              <i className="fa-solid fa-trash-can" aria-hidden="true" />
              Sí, eliminar
            </Button>
          </>
        }
      >
        {ordenAEliminar && (
          <div className="space-y-3">
            <p className="text-sm">
              ¿Eliminar definitivamente la orden{' '}
              <strong className="font-mono">Folio #{ordenAEliminar.folio_fisico || ordenAEliminar.id_orden}</strong>{' '}
              de <strong>{ordenAEliminar.cliente_nombre}</strong>?
            </p>
            <p className="text-sm text-gray-700">
              Se borrarán también los servicios aplicados y el historial de estados.
              <strong> Esta acción no se puede deshacer.</strong>
            </p>
            {errorEliminar && (
              <div className="p-3 rounded bg-red-100 text-red-900 font-bold text-sm border border-red-400">
                {errorEliminar}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
