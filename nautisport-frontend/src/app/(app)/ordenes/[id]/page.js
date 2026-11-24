'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/services/api';
import { Badge, Button, Card, Tabla, Modal } from '@/components/ui';
import { formatearFecha, formatearFechaHora, formatearPrecio } from '@/lib/validaciones';
import { useAuth } from '@/hooks/useAuth';

export default function OrdenDetallePage() {
  const { id } = useParams();
  const router = useRouter();
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'Administrador';

  const [orden, setOrden] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Eliminación (solo Administrador)
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState(null);

  const eliminarOrden = async () => {
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await api.delete(`/ordenes/${id}`);
      router.replace('/ordenes');
    } catch (err) {
      console.error('Error al eliminar la orden:', err);
      setErrorEliminar(err.response?.data?.error || 'No se pudo eliminar la orden');
      setEliminando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    setError(null);
    api.get(`/ordenes/${id}`)
      .then(res => setOrden(res.data))
      .catch(err => {
        console.error('Error al cargar la orden:', err);
        setError(err.response?.data?.error || 'Error al cargar el detalle de la orden');
      })
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) {
    return <p className="text-gray-700 font-semibold text-center py-10">Cargando orden de trabajo...</p>;
  }

  if (error || !orden) {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <p className="p-4 rounded bg-red-100 text-red-900 font-bold border border-red-400 mb-6">{error}</p>
        <Link href="/ordenes" className="text-black font-bold underline">
          <i className="fa-solid fa-arrow-left mr-1" aria-hidden="true" />
          Volver a Órdenes
        </Link>
      </div>
    );
  }

  const conSobrecostos = orden.monto_total > orden.monto_inicial;

  // Columnas de la tabla de servicios aplicados
  const columnasServicios = [
    {
      key: 'servicio',
      label: 'Servicio',
      render: (d) => d.servicio_nombre || (
        <span className="italic">{d.descripcion_custom} <span className="text-xs text-gray-500">(personalizado)</span></span>
      ),
    },
    {
      key: 'precio_aplicado',
      label: 'Precio',
      render: (d) => formatearPrecio(d.precio_aplicado),
    },
    {
      key: 'es_sobrecosto',
      label: 'Tipo',
      render: (d) => d.es_sobrecosto
        ? <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">Sobrecosto</span>
        : <span className="text-xs text-gray-500">Base</span>,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto print:max-w-full">
      {/* Cabecera */}
      <Link href="/ordenes" className="inline-block text-sm font-bold text-gray-600 hover:text-black mb-4 print:hidden">
        <i className="fa-solid fa-arrow-left mr-1" aria-hidden="true" />
        Volver a Órdenes
      </Link>
      <div className="bg-white shadow-xl rounded-lg border border-gray-300 p-6 md:p-8 print:shadow-none print:border-0 print:p-0">
        <div className="border-b-2 border-black pb-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold uppercase tracking-wider text-black">
              Orden #{orden.id_orden}
            </h1>
            <p className="text-sm font-bold text-gray-700 font-mono">
              Folio físico: {orden.folio_fisico || 'sin talonario'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge estado={orden.estado} className="text-sm px-4 py-1" />
            <Button
              variant="secondary"
              onClick={() => window.print()}
              className="print:hidden"
            >
              <i className="fa-solid fa-print" aria-hidden="true" />
              Imprimir comanda
            </Button>
            {esAdmin && (
              <Button
                variant="danger"
                onClick={() => {
                  setErrorEliminar(null);
                  setEliminarAbierto(true);
                }}
                className="print:hidden"
              >
                <i className="fa-solid fa-trash-can" aria-hidden="true" />
                Eliminar orden
              </Button>
            )}
          </div>
        </div>

        {/* Cliente y Equipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card title="Cliente">
            <p className="font-bold text-black">{orden.cliente_nombre}</p>
            <p className="text-sm text-gray-700">{orden.cliente_telefono}</p>
            {orden.cliente_email && <p className="text-sm text-gray-700">{orden.cliente_email}</p>}
          </Card>
          <Card title="Equipo">
            <p className="font-bold text-black">{orden.equipo_tipo} — {orden.equipo_marca_modelo}</p>
            {orden.equipo_fijaciones && <p className="text-sm text-gray-700">Fijaciones: {orden.equipo_fijaciones}</p>}
            {orden.equipo_zapatos && <p className="text-sm text-gray-700">Botas: {orden.equipo_zapatos}</p>}
            {orden.equipo_peso && <p className="text-sm text-gray-700">Peso/ajuste: {orden.equipo_peso} kg</p>}
          </Card>
        </div>

        {/* Fechas y técnico */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 border border-gray-300 rounded p-3">
            <p className="text-xs font-bold uppercase text-gray-500">Recepción</p>
            <p className="text-sm font-bold">{formatearFechaHora(orden.fecha_recepcion)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-300 rounded p-3">
            <p className="text-xs font-bold uppercase text-gray-500">Entrega estimada</p>
            <p className="text-sm font-bold">{formatearFecha(orden.fecha_entrega_estimada?.slice(0, 10))}</p>
          </div>
          <div className="bg-gray-50 border border-gray-300 rounded p-3">
            <p className="text-xs font-bold uppercase text-gray-500">Entrega real</p>
            <p className="text-sm font-bold">{orden.fecha_entrega_real ? formatearFechaHora(orden.fecha_entrega_real) : '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-300 rounded p-3">
            <p className="text-xs font-bold uppercase text-gray-500">Técnico asignado</p>
            <p className="text-sm font-bold">{orden.tecnico_nombre || 'Sin asignar'}</p>
          </div>
        </div>

        {/* Servicios aplicados */}
        <Card title="Servicios Aplicados" className="mb-6">
          <Tabla columnas={columnasServicios} filas={orden.servicios} vacio="No hay servicios registrados" />
          <div className="mt-4 flex justify-end gap-6 text-sm">
            <div className="text-right">
              <p className="text-xs font-bold uppercase text-gray-500">Monto inicial (base)</p>
              <p className="font-bold">{formatearPrecio(orden.monto_inicial)}</p>
            </div>
            <div className="text-right border-l border-gray-300 pl-6">
              <p className="text-xs font-bold uppercase text-gray-500">
                Monto total {conSobrecostos && <span className="text-red-600">(incluye sobrecostos)</span>}
              </p>
              <p className={`font-extrabold text-lg ${conSobrecostos ? 'text-red-700' : ''}`}>
                {formatearPrecio(orden.monto_total)}
              </p>
            </div>
          </div>
        </Card>

        {/* Observaciones */}
        {orden.observaciones && (
          <Card title="Observaciones de Recepción" className="mb-6">
            <p className="italic text-gray-700 text-sm whitespace-pre-line">{orden.observaciones}</p>
          </Card>
        )}

        {/* Historial de estados (trazabilidad) */}
        <Card title="Historial de Estados" className="print:hidden">
          <ol className="relative border-l-2 border-gray-300 ml-3 space-y-5">
            {orden.historial.map((h) => (
              <li key={h.id_historial} className="ml-4">
                <span className="absolute -left-[9px] mt-1.5 w-4 h-4 rounded-full border-2 border-black bg-white" />
                <p className="font-bold text-sm text-black">
                  {h.estado_anterior
                    ? <><Badge estado={h.estado_anterior} className="!text-[10px] mr-1" /> <i className="fa-solid fa-arrow-right mx-1 text-gray-500" aria-hidden="true" /> <Badge estado={h.estado_nuevo} className="!text-[10px] ml-1" /></>
                    : <>Orden creada <Badge estado={h.estado_nuevo} className="!text-[10px] ml-1" /></>}
                </p>
                <p className="text-xs text-gray-600 font-semibold mt-0.5">
                  {formatearFechaHora(h.fecha_cambio)}
                  {h.usuario_nombre && <> · por <span className="text-black">{h.usuario_nombre}</span></>}
                </p>
                {h.comentario && <p className="text-xs italic text-gray-700 mt-1">“{h.comentario}”</p>}
              </li>
            ))}
          </ol>
        </Card>

        {/* Firmas (solo al imprimir) */}
        <div className="hidden print:block mt-12">
          <div className="grid grid-cols-2 gap-12 text-center text-sm">
            <div className="border-t border-black pt-2 font-bold">Firma Cliente</div>
            <div className="border-t border-black pt-2 font-bold">Firma Taller</div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-8">
            NautiSport · Taller de Ski y Snowboard
          </p>
        </div>
      </div>

      {/* Confirmación de eliminación (solo Administrador) */}
      <Modal
        open={eliminarAbierto}
        onClose={() => {
          if (!eliminando) {
            setEliminarAbierto(false);
            setErrorEliminar(null);
          }
        }}
        title="Eliminar orden de trabajo"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEliminarAbierto(false);
                setErrorEliminar(null);
              }}
              disabled={eliminando}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={eliminarOrden} loading={eliminando}>
              <i className="fa-solid fa-trash-can" aria-hidden="true" />
              Sí, eliminar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">
            ¿Eliminar definitivamente la orden{' '}
            <strong className="font-mono">Folio #{orden.folio_fisico || orden.id_orden}</strong>{' '}
            de <strong>{orden.cliente_nombre}</strong>?
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
      </Modal>
    </div>
  );
}
