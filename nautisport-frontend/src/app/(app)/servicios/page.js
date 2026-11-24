'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, Modal, Select, Tabla, Textarea } from '@/components/ui';
import { formatearPrecio } from '@/lib/validaciones';

const TIPOS = [
  { value: '', label: 'Ambos (Ski y Snowboard)' },
  { value: 'Ski', label: 'Ski' },
  { value: 'Snowboard', label: 'Snowboard' },
  { value: 'Otros', label: 'Otros' },
];

function EtiquetaTipo({ tipo }) {
  const estilos = {
    Ski: 'bg-blue-100 text-blue-900',
    Snowboard: 'bg-purple-100 text-purple-900',
    Otros: 'bg-yellow-100 text-yellow-900',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${estilos[tipo] || 'bg-gray-200 text-gray-700'}`}>
      {tipo || 'Ambos'}
    </span>
  );
}

function EtiquetaActivo({ activo }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
      activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-500'
    }`}>
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

const FORM_VACIO = { nombre: '', tipo_equipo: '', precio_base: '', descripcion: '' };

export default function ServiciosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'Administrador';

  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // Modal: null | { modo: 'crear' | 'editar', form, activo }
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/servicios');
      setServicios(res.data);
      setError(false);
    } catch (err) {
      console.error('Error al cargar servicios:', err);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    cargar();
  }, [esAdmin, cargar]);

  const abrirCrear = () => {
    setErrorModal(null);
    setModal({ modo: 'crear', form: { ...FORM_VACIO }, activo: true });
  };

  const abrirEditar = (s) => {
    setErrorModal(null);
    setModal({
      modo: 'editar',
      form: {
        id_servicio: s.id_servicio,
        nombre: s.nombre,
        tipo_equipo: s.tipo_equipo || '',
        precio_base: s.precio_base,
        descripcion: s.descripcion || '',
      },
      activo: s.activo,
    });
  };

  const setCampo = (campo, valor) => {
    setModal(m => ({ ...m, form: { ...m.form, [campo]: valor } }));
  };

  const guardar = async () => {
    setGuardando(true);
    setErrorModal(null);
    const { modo, form, activo } = modal;
    try {
      const body = {
        nombre: form.nombre,
        tipo_equipo: form.tipo_equipo || null,
        precio_base: Number(form.precio_base),
        descripcion: form.descripcion || null,
      };
      if (modo === 'crear') {
        await api.post('/servicios', body);
        setMensaje({ tipo: 'ok', texto: `Servicio "${form.nombre}" creado` });
      } else {
        await api.put(`/servicios/${form.id_servicio}`, { ...body, activo });
        setMensaje({ tipo: 'ok', texto: `Servicio "${form.nombre}" actualizado` });
      }
      setModal(null);
      await cargar();
    } catch (err) {
      setErrorModal(err.response?.data?.error || 'Error al guardar el servicio');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = async (servicio) => {
    try {
      if (servicio.activo) {
        await api.delete(`/servicios/${servicio.id_servicio}`);
        setMensaje({ tipo: 'ok', texto: `Servicio "${servicio.nombre}" desactivado` });
      } else {
        await api.put(`/servicios/${servicio.id_servicio}`, { activo: true });
        setMensaje({ tipo: 'ok', texto: `Servicio "${servicio.nombre}" reactivado` });
      }
      await cargar();
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'Error al cambiar el estado del servicio',
      });
    }
  };

  if (!esAdmin) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <i className="fa-solid fa-lock text-5xl text-black" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-extrabold uppercase text-black">Acceso restringido</h1>
        <p className="mt-2 text-gray-600 font-medium">
          La gestión del catálogo de servicios está disponible solo para el rol Administrador.
        </p>
      </div>
    );
  }

  const columnas = [
    { key: 'nombre', label: 'Servicio', render: (s) => <span className="font-bold">{s.nombre}</span> },
    { key: 'tipo_equipo', label: 'Disciplina', render: (s) => <EtiquetaTipo tipo={s.tipo_equipo} /> },
    {
      key: 'precio_base',
      label: 'Precio base',
      render: (s) => <span className="font-bold font-mono">{formatearPrecio(s.precio_base)}</span>,
    },
    { key: 'activo', label: 'Estado', render: (s) => <EtiquetaActivo activo={s.activo} /> },
    {
      key: 'acciones',
      label: '',
      render: (s) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => abrirEditar(s)} className="!text-xs !py-1.5">
            <i className="fa-solid fa-pen" aria-hidden="true" />
            Editar
          </Button>
          <Button
            variant={s.activo ? 'danger' : 'primary'}
            onClick={() => cambiarActivo(s)}
            className="!text-xs !py-1.5"
          >
            <i className={`fa-solid ${s.activo ? 'fa-ban' : 'fa-rotate-left'}`} aria-hidden="true" />
            {s.activo ? 'Desactivar' : 'Reactivar'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="border-b-2 border-black pb-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">Catálogo de Servicios</h1>
          <p className="text-base font-bold text-gray-700">Servicios y precios base por disciplina</p>
        </div>
        <Button onClick={abrirCrear}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
          Nuevo Servicio
        </Button>
      </div>

      {mensaje && (
        <div className={`mb-6 p-4 rounded font-bold border ${
          mensaje.tipo === 'ok'
            ? 'bg-green-100 text-green-900 border-green-400'
            : 'bg-red-100 text-red-900 border-red-400'
        }`}>
          <i className={`fa-solid ${mensaje.tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'} mr-2`} aria-hidden="true" />
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
        <p className="text-gray-700 font-semibold">Cargando catálogo...</p>
      ) : (
        <Tabla columnas={columnas} filas={servicios} vacio="No hay servicios registrados" />
      )}

      {/* Modal crear / editar */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.modo === 'crear' ? 'Nuevo Servicio' : 'Editar Servicio'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              onClick={guardar}
              loading={guardando}
              disabled={!modal?.form?.nombre?.trim() || modal?.form?.precio_base === ''}
            >
              <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
              Guardar
            </Button>
          </>
        }
      >
        {modal && (
          <div className="space-y-4">
            {errorModal && (
              <p className="p-2 rounded bg-red-100 text-red-900 text-sm font-bold border border-red-400">{errorModal}</p>
            )}
            <Input
              label="Nombre del servicio"
              name="nombre"
              required
              placeholder="Ej: Tune up"
              value={modal.form.nombre}
              onChange={e => setCampo('nombre', e.target.value)}
            />
            <Select
              label="Disciplina"
              name="tipo_equipo"
              value={modal.form.tipo_equipo}
              onChange={e => setCampo('tipo_equipo', e.target.value)}
            >
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Input
              label="Precio base (CLP)"
              name="precio_base"
              type="number"
              min="0"
              required
              placeholder="Ej: 40000"
              value={modal.form.precio_base}
              onChange={e => setCampo('precio_base', e.target.value)}
            />
            <Textarea
              label="Descripción (opcional)"
              name="descripcion"
              rows={2}
              value={modal.form.descripcion}
              onChange={e => setCampo('descripcion', e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
