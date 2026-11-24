'use client';

import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { formatearFecha, formatearPrecio } from '@/lib/validaciones';

// Tarjeta de OT del tablero del Taller. Las acciones visibles dependen del estado y del rol.
export default function TarjetaOT({
  orden,
  usuario,
  accionEnCurso,
  onIniciar,
  onFinalizar,
  onEntregar,
  onAprobar,
  onRechazar,
  onAgregarServicio,
}) {
  const esTecnico = usuario?.rol === 'Tecnico';
  const puedeAutorizar = ['Administrador', 'Recepcion'].includes(usuario?.rol);

  const cargando = (estado) => accionEnCurso === `${estado}:${orden.id_orden}`;

  return (
    <article className="bg-white border border-gray-300 rounded-lg p-3 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/ordenes/${orden.id_orden}`}
          className="font-mono font-extrabold text-black hover:underline"
        >
          #{orden.id_orden}
        </Link>
        <Badge estado={orden.estado} />
      </div>

      <div>
        <p className="font-bold text-sm text-black leading-tight">{orden.cliente_nombre}</p>
        <p className="text-xs text-gray-600">{orden.equipo_tipo} — {orden.equipo_modelo}</p>
      </div>

      <dl className="text-xs text-gray-600 space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt>Folio</dt>
          <dd className="font-mono font-semibold text-black">{orden.folio_fisico || '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Entrega est.</dt>
          <dd className="font-semibold text-black">
            {formatearFecha(orden.fecha_entrega_estimada?.slice(0, 10))}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Técnico</dt>
          <dd className="font-semibold text-black">{orden.tecnico_nombre || 'Sin asignar'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Total</dt>
          <dd className="font-bold text-black">{formatearPrecio(orden.monto_total)}</dd>
        </div>
      </dl>

      <div className="mt-auto pt-2 border-t border-gray-200 flex gap-2">
        {orden.estado === 'Pendiente' && (
          <Button
            onClick={() => onIniciar(orden)}
            loading={cargando('En Mantención')}
            className="w-full !text-xs !py-1.5"
          >
            <i className="fa-solid fa-play" aria-hidden="true" />
            Iniciar mantención
          </Button>
        )}

        {orden.estado === 'En Mantención' && (
          <>
            {esTecnico && (
              <Button
                variant="secondary"
                onClick={() => onAgregarServicio(orden)}
                className="flex-1 !text-xs !py-1.5"
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                Servicio
              </Button>
            )}
            <Button
              onClick={() => onFinalizar(orden)}
              loading={cargando('Finalizado')}
              className="flex-1 !text-xs !py-1.5"
            >
              <i className="fa-solid fa-flag-checkered" aria-hidden="true" />
              Finalizar
            </Button>
          </>
        )}

        {orden.estado === 'Requiere Autorización' && (
          puedeAutorizar ? (
            <>
              <Button
                onClick={() => onAprobar(orden)}
                loading={cargando('En Mantención')}
                className="flex-1 !text-xs !py-1.5"
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
                Aprobar
              </Button>
              <Button
                variant="danger"
                onClick={() => onRechazar(orden)}
                loading={cargando('Finalizado')}
                className="flex-1 !text-xs !py-1.5"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
                Rechazar
              </Button>
            </>
          ) : (
            <p className="text-xs font-semibold text-red-700">
              Esperando autorización de Recepción/Admin
            </p>
          )
        )}

        {orden.estado === 'Finalizado' && (
          puedeAutorizar ? (
            <Button
              onClick={() => onEntregar(orden)}
              loading={cargando('Entregado')}
              className="w-full !text-xs !py-1.5"
            >
              <i className="fa-solid fa-box-open" aria-hidden="true" />
              Entregar equipo
            </Button>
          ) : (
            <p className="text-xs font-semibold text-gray-500">Listo para entrega</p>
          )
        )}
      </div>
    </article>
  );
}
