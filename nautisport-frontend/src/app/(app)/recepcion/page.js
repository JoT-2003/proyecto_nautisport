'use client';

import { useState, useEffect } from 'react';
import api from '@/services/api';
import { Input, Select, Textarea, Button, Card, Modal } from '@/components/ui';
import { validarTelefono, formatearFecha, formatearPrecio } from '@/lib/validaciones';
import { useClienteLookup } from '@/hooks/useClienteLookup';

const CLIENTE_VACIO = { nombre: '', telefono: '+569', email: '' };
const EQUIPO_VACIO = { tipo: 'Ski', marca_modelo: '', peso: '', fijaciones: '', zapatos: '' };

export default function RecepcionPage() {
  const [servicios, setServicios] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(true);
  const [errorServicios, setErrorServicios] = useState(false);

  // Estados del Formulario
  const [cliente, setCliente] = useState(CLIENTE_VACIO);
  const [equipo, setEquipo] = useState(EQUIPO_VACIO);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null); // equipo ya registrado
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState([]);
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Estados de UI
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }

  // Catálogo de servicios
  useEffect(() => {
    setCargandoServicios(true);
    api.get('/servicios')
      .then(res => {
        setServicios(res.data);
        setErrorServicios(false);
      })
      .catch(err => {
        console.error('Error al cargar servicios:', err);
        setErrorServicios(true);
      })
      .finally(() => setCargandoServicios(false));
  }, []);

  // Búsqueda de cliente por teléfono (debounce)
  const errorTelefono = validarTelefono(cliente.telefono);
  const lookup = useClienteLookup(cliente.telefono);
  const clienteExistente = lookup.status === 'encontrado' ? lookup.cliente : null;

  // Autocompletar datos del cliente encontrado (queda en solo lectura)
  useEffect(() => {
    if (clienteExistente) {
      setCliente(c => ({
        ...c,
        nombre: clienteExistente.nombre,
        email: clienteExistente.email || '',
      }));
    }
  }, [clienteExistente]);

  const handleServiceChange = (id) => {
    if (serviciosSeleccionados.includes(id)) {
      setServiciosSeleccionados(serviciosSeleccionados.filter(sId => sId !== id));
    } else {
      setServiciosSeleccionados([...serviciosSeleccionados, id]);
    }
  };

  // Servicios activos que aplican a la disciplina del equipo ('Otros' muestra todos)
  const serviciosDisponibles = servicios.filter(s =>
    s.activo !== false &&
    (!s.tipo_equipo || equipo.tipo === 'Otros' || s.tipo_equipo === equipo.tipo)
  );

  // Estimación local (el monto definitivo lo calcula el trigger de la BD al crear la OT)
  const totalEstimado = servicios
    .filter(s => serviciosSeleccionados.includes(s.id_servicio))
    .reduce((acc, s) => acc + Number(s.precio_base || 0), 0);

  // Selección de un equipo ya registrado (o vuelta a equipo nuevo)
  const seleccionarEquipo = (eq) => {
    // Al cambiar de equipo puede cambiar la disciplina: se limpian los servicios marcados
    setServiciosSeleccionados([]);
    if (eq === null) {
      setEquipoSeleccionado(null);
      setEquipo(EQUIPO_VACIO);
      return;
    }
    setEquipoSeleccionado(eq);
    setEquipo({
      tipo: eq.tipo,
      marca_modelo: eq.marca_modelo,
      peso: eq.peso ?? '',
      fijaciones: eq.fijaciones || '',
      zapatos: eq.zapatos || '',
    });
  };

  const resetFormulario = () => {
    setCliente(CLIENTE_VACIO);
    setEquipo(EQUIPO_VACIO);
    setEquipoSeleccionado(null);
    setServiciosSeleccionados([]);
    setFechaEntrega('');
    setObservaciones('');
  };

  // 1er paso: abrir el modal de confirmación con el resumen
  const handleSubmit = (e) => {
    e.preventDefault();
    if (errorTelefono) return;
    setConfirmarAbierto(true);
  };

  // 2do paso: envío real tras confirmar
  const confirmarEnvio = async () => {
    setConfirmarAbierto(false);
    setEnviando(true);
    setMensaje(null);

    try {
      // 1. Reutilizar el cliente encontrado o registrar uno nuevo (RF-01)
      let id_cliente = clienteExistente?.id_cliente;
      if (!id_cliente) {
        const resCliente = await api.post('/clientes', cliente);
        id_cliente = resCliente.data.id_cliente;
      }

      // 2. Generar Orden de Trabajo (RF-02), reutilizando equipo si corresponde
      const resOT = await api.post('/ordenes', {
        id_cliente,
        id_equipo: equipoSeleccionado?.id_equipo ?? null,
        equipo,
        fecha_entrega_estimada: fechaEntrega,
        servicios: serviciosSeleccionados,
        observaciones
      });

      setMensaje({
        tipo: 'ok',
        texto: `¡Orden Folio #${resOT.data.folio_fisico || resOT.data.id_orden} registrada exitosamente!`,
      });
      resetFormulario();
    } catch (error) {
      console.error(error);
      setMensaje({
        tipo: 'error',
        texto: error.response?.data?.error || 'Error al procesar la recepción',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white shadow-xl rounded-lg border border-gray-300 p-8">

        {/* Cabecera */}
        <div className="border-b-2 border-black pb-4 mb-6 text-center">
          <h1 className="text-3xl font-extrabold uppercase tracking-wider text-black">Recepción de Equipos</h1>
          <p className="text-base font-bold text-gray-700">NautiSport — Registro de Orden de Trabajo</p>
        </div>

        {mensaje && (
          <div className={`mb-6 p-4 rounded font-bold text-center border ${
            mensaje.tipo === 'ok'
              ? 'bg-green-100 text-green-900 border-green-400'
              : 'bg-red-100 text-red-900 border-red-400'
          }`}>
            <i className={`fa-solid ${mensaje.tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'} mr-2`} aria-hidden="true" />
            {mensaje.texto}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Fecha de entrega (el folio se asigna automáticamente) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded border border-gray-300">
            <div className="flex flex-col justify-end">
              <span className="block text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">
                Folio Físico
              </span>
              <div className="w-full border border-dashed border-gray-400 rounded-lg px-3 py-2.5 bg-white text-sm font-bold text-gray-600">
                Se asigna automáticamente al registrar la orden
              </div>
            </div>
            <Input
              label="Fecha Estimada de Entrega"
              name="fecha_entrega"
              type="date"
              required
              value={fechaEntrega}
              onChange={e => setFechaEntrega(e.target.value)}
            />
          </div>

          {/* 1. Datos del Cliente */}
          <Card title="1. Datos del Cliente">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Nombre Completo"
                name="nombre"
                type="text"
                required
                placeholder="Juan Pérez"
                value={cliente.nombre}
                readOnly={!!clienteExistente}
                onChange={e => setCliente({...cliente, nombre: e.target.value})}
              />
              <Input
                label="Teléfono (+569)"
                name="telefono"
                type="text"
                required
                placeholder="+56912345678"
                value={cliente.telefono}
                error={cliente.telefono.length > 4 ? errorTelefono : null}
                onChange={e => setCliente({...cliente, telefono: e.target.value})}
              />
              <Input
                label="Correo Electrónico"
                name="email"
                type="email"
                placeholder="juan@email.com"
                value={cliente.email}
                readOnly={!!clienteExistente}
                onChange={e => setCliente({...cliente, email: e.target.value})}
              />
            </div>

            {/* Resultado de la búsqueda por teléfono */}
            {lookup.status === 'buscando' && (
              <p className="mt-3 text-xs font-semibold text-gray-500">
                <i className="fa-solid fa-magnifying-glass mr-1" aria-hidden="true" />
                Buscando cliente en la base de datos...
              </p>
            )}

            {clienteExistente && (
              <div className="mt-3 p-3 rounded bg-blue-50 border border-blue-300">
                <p className="text-sm font-bold text-blue-900">
                  <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
                  Cliente registrado (N° {clienteExistente.id_cliente}) — se usará su ficha existente
                </p>
                {lookup.equipos.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-bold uppercase text-blue-900">
                      Equipos anteriores — selecciona uno para reutilizar sus datos:
                    </p>
                    <div className="mt-1 flex flex-col gap-1">
                      {lookup.equipos.map(eq => (
                        <button
                          key={eq.id_equipo}
                          type="button"
                          onClick={() => seleccionarEquipo(equipoSeleccionado?.id_equipo === eq.id_equipo ? null : eq)}
                          className={`text-left text-sm p-2 rounded border transition-colors ${
                            equipoSeleccionado?.id_equipo === eq.id_equipo
                              ? 'bg-black text-white border-black font-bold'
                              : 'bg-white border-gray-300 hover:border-black'
                          }`}
                        >
                          {equipoSeleccionado?.id_equipo === eq.id_equipo && (
                            <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                          )}
                          <span className="font-bold">{eq.tipo}</span> — {eq.marca_modelo}
                          {eq.fijaciones ? ` · Fijaciones: ${eq.fijaciones}` : ''}
                          {eq.zapatos ? ` · Botas: ${eq.zapatos}` : ''}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {equipoSeleccionado && (
                  <button
                    type="button"
                    onClick={() => seleccionarEquipo(null)}
                    className="mt-2 text-xs font-bold text-blue-800 underline hover:text-black"
                  >
                    <i className="fa-solid fa-xmark mr-1" aria-hidden="true" />
                    Deseleccionar — registrar equipo nuevo
                  </button>
                )}
              </div>
            )}

            {lookup.status === 'nuevo' && (
              <p className="mt-3 text-sm font-bold text-gray-700">
                <i className="fa-solid fa-user-plus mr-1" aria-hidden="true" />
                Cliente nuevo — complete sus datos para registrar la ficha
              </p>
            )}
          </Card>

          {/* 2. Datos del Equipo */}
          <Card title="2. Datos del Equipo">
            {equipoSeleccionado && (
              <p className="mb-3 text-sm font-bold text-gray-800">
                Usando equipo registrado N° {equipoSeleccionado.id_equipo} (solo lectura).{' '}
                <button type="button" onClick={() => seleccionarEquipo(null)} className="underline text-blue-800">
                  Cambiar
                </button>
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <Select
                label="Tipo de Equipo"
                name="tipo"
                disabled={!!equipoSeleccionado}
                value={equipo.tipo}
                onChange={e => {
                  setEquipo({ ...equipo, tipo: e.target.value });
                  // Al cambiar de disciplina se limpian los servicios seleccionados
                  setServiciosSeleccionados([]);
                }}
              >
                <option value="Ski">Ski</option>
                <option value="Snowboard">Snowboard</option>
                <option value="Otros">Otros</option>
              </Select>
              <Input
                label="Marca / Modelo"
                name="marca_modelo"
                type="text"
                required
                placeholder="Ej: Dynafit"
                value={equipo.marca_modelo}
                readOnly={!!equipoSeleccionado}
                onChange={e => setEquipo({...equipo, marca_modelo: e.target.value})}
              />
              <Input
                label="Peso (kg) / Ajuste"
                name="peso"
                type="number"
                placeholder="80"
                value={equipo.peso}
                readOnly={!!equipoSeleccionado}
                onChange={e => setEquipo({...equipo, peso: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Fijaciones"
                name="fijaciones"
                type="text"
                placeholder="Ej: Look Pivot"
                value={equipo.fijaciones}
                readOnly={!!equipoSeleccionado}
                onChange={e => setEquipo({...equipo, fijaciones: e.target.value})}
              />
              <Input
                label="Zapatos / Botas"
                name="zapatos"
                type="text"
                placeholder="Ej: Salomon X-Pro"
                value={equipo.zapatos}
                readOnly={!!equipoSeleccionado}
                onChange={e => setEquipo({...equipo, zapatos: e.target.value})}
              />
            </div>
          </Card>

          {/* 3. Selección de Servicios */}
          <Card title="3. Servicios Requeridos" variant="highlight">
            {errorServicios ? (
              <p className="text-red-600 font-bold text-sm bg-red-50 p-3 rounded border border-red-300">
                <i className="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true" />
                No se pudo cargar el catálogo de servicios. Revisa tu conexión e intenta nuevamente.
              </p>
            ) : cargandoServicios ? (
              <p className="text-gray-700 font-semibold text-sm">Cargando catálogo de servicios desde la base de datos...</p>
            ) : serviciosDisponibles.length === 0 ? (
              <p className="text-gray-700 font-semibold text-sm">
                No hay servicios activos para {equipo.tipo === 'Otros' ? 'este tipo de equipo' : equipo.tipo}.
                {servicios.length > 0 && ' Revisa el catálogo con un Administrador.'}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {serviciosDisponibles.map((s) => (
                    <label key={s.id_servicio} className="flex items-center gap-2 bg-white p-3 rounded border border-gray-300 cursor-pointer hover:bg-yellow-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={serviciosSeleccionados.includes(s.id_servicio)}
                        onChange={() => handleServiceChange(s.id_servicio)}
                        className="w-5 h-5 accent-black shrink-0"
                      />
                      <span className="font-bold text-black text-sm flex-1">{s.nombre}</span>
                      <span className="text-xs font-bold text-gray-600 font-mono whitespace-nowrap">
                        {formatearPrecio(s.precio_base)}
                      </span>
                    </label>
                  ))}
                </div>
                {serviciosSeleccionados.length > 0 && (
                  <p className="mt-3 text-sm font-bold text-gray-900">
                    {serviciosSeleccionados.length} servicio(s) seleccionado(s) — Total estimado:{' '}
                    <span className="font-mono">{formatearPrecio(totalEstimado)}</span>
                  </p>
                )}
              </>
            )}
          </Card>

          {/* Observaciones */}
          <Textarea
            label="Observaciones / Arreglos Diversos"
            name="observaciones"
            rows={3}
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Detalles sobre el estado del equipo..."
          />

          {/* Botón de Envío */}
          <Button type="submit" className="w-full text-lg">
            <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
            Revisar y Guardar Orden
          </Button>
        </form>
      </div>

      {/* Modal de confirmación: resumen previo al envío */}
      <Modal
        open={confirmarAbierto}
        onClose={() => setConfirmarAbierto(false)}
        title="Confirmar Orden de Trabajo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmarAbierto(false)}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              Volver
            </Button>
            <Button onClick={confirmarEnvio} loading={enviando}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              Confirmar y Guardar
            </Button>
          </>
        }
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase text-gray-500">Folio Físico</dt>
            <dd className="font-bold text-gray-600">Se asigna automáticamente al guardar</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-gray-500">Fecha Estimada de Entrega</dt>
            <dd className="font-bold">{formatearFecha(fechaEntrega)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-gray-500">Cliente</dt>
            <dd className="font-bold">
              {cliente.nombre} <span className="font-normal text-gray-600">({cliente.telefono})</span>{' '}
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded align-middle ${
                clienteExistente
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {clienteExistente ? 'Registrado' : 'Nuevo'}
              </span>
            </dd>
            {clienteExistente && (
              <dd className="text-xs text-gray-600">
                Ficha existente N° {clienteExistente.id_cliente} — no se duplicará el registro
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-gray-500">Equipo</dt>
            <dd className="font-bold">
              {equipoSeleccionado
                ? `Registrado N° ${equipoSeleccionado.id_equipo}: ${equipo.tipo} — ${equipo.marca_modelo}`
                : `${equipo.tipo} — ${equipo.marca_modelo}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-gray-500">
              Servicios ({serviciosSeleccionados.length})
            </dt>
            <dd>
              {serviciosSeleccionados.length === 0 ? (
                <span className="text-red-600 font-semibold">Ninguno seleccionado</span>
              ) : (
                <>
                  <ul className="list-disc list-inside">
                    {servicios
                      .filter(s => serviciosSeleccionados.includes(s.id_servicio))
                      .map(s => (
                        <li key={s.id_servicio}>
                          {s.nombre} — <span className="font-mono font-bold">{formatearPrecio(s.precio_base)}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-1 font-bold text-black">
                    Total estimado: <span className="font-mono">{formatearPrecio(totalEstimado)}</span>
                  </p>
                </>
              )}
            </dd>
          </div>
          {observaciones && (
            <div>
              <dt className="text-xs font-bold uppercase text-gray-500">Observaciones</dt>
              <dd className="italic text-gray-700">{observaciones}</dd>
            </div>
          )}
        </dl>
      </Modal>
    </div>
  );
}
