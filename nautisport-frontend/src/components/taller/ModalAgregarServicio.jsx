'use client';

import { useMemo, useState } from 'react';
import api from '@/services/api';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { formatearPrecio } from '@/lib/validaciones';

// Modal para agregar un servicio del catálogo o un arreglo personalizado a una OT.
// Si es sobrecosto, el backend marca la OT como "Requiere Autorización".
export default function ModalAgregarServicio({ orden, servicios, onClose, onAgregado }) {
  const [modo, setModo] = useState('catalogo'); // 'catalogo' | 'personalizado'
  const [idServicio, setIdServicio] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [esSobrecosto, setEsSobrecosto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const servicioSel = useMemo(
    () => servicios.find(s => String(s.id_servicio) === String(idServicio)),
    [servicios, idServicio]
  );

  const cambiarModo = (nuevo) => {
    setModo(nuevo);
    setError(null);
    setEsSobrecosto(nuevo === 'personalizado'); // custom = sobrecosto por defecto
  };

  const valido = modo === 'catalogo' ? !!idServicio : descripcion.trim() !== '' && precio !== '';
  const precioSobreBase = modo === 'catalogo' && servicioSel && precio !== '' && Number(precio) > servicioSel.precio_base;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const body = modo === 'catalogo'
        ? {
            id_servicio: Number(idServicio),
            ...(precio !== '' ? { precio_aplicado: Number(precio) } : {}),
            es_sobrecosto: esSobrecosto,
          }
        : {
            descripcion_custom: descripcion.trim(),
            precio_aplicado: Number(precio),
            es_sobrecosto: esSobrecosto,
          };

      const res = await api.post(`/ordenes/${orden.id_orden}/servicios`, body);
      onAgregado(res.data);
    } catch (err) {
      console.error('Error al agregar servicio:', err);
      setError(err.response?.data?.error || 'Error al agregar el servicio');
    } finally {
      setEnviando(false);
    }
  };

  const clasesTab = (activo) =>
    `flex-1 py-2 rounded font-bold text-xs uppercase tracking-wider border transition-colors ${
      activo ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-400 hover:border-black'
    }`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Agregar servicio a OT #${orden.id_orden}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} loading={enviando} disabled={!valido}>
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="p-2 rounded bg-red-100 text-red-900 text-sm font-bold border border-red-400">{error}</p>
        )}

        {/* Selector de modo */}
        <div className="flex gap-2">
          <button type="button" onClick={() => cambiarModo('catalogo')} className={clasesTab(modo === 'catalogo')}>
            Del catálogo
          </button>
          <button type="button" onClick={() => cambiarModo('personalizado')} className={clasesTab(modo === 'personalizado')}>
            Personalizado
          </button>
        </div>

        {modo === 'catalogo' ? (
          <>
            <Select
              label="Servicio"
              name="id_servicio"
              value={idServicio}
              onChange={e => setIdServicio(e.target.value)}
            >
              <option value="">— Seleccionar servicio —</option>
              {servicios.map(s => (
                <option key={s.id_servicio} value={s.id_servicio}>{s.nombre}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-600">
              Precio base: <span className="font-bold text-black">
                {servicioSel ? formatearPrecio(servicioSel.precio_base) : '—'}
              </span>
            </p>
            <Input
              label="Precio aplicado (opcional)"
              name="precio"
              type="number"
              min="0"
              placeholder="Vacío = precio base"
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
            {precioSobreBase && !esSobrecosto && (
              <p className="text-xs font-semibold text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
                El precio supera el base. Marca "Es sobrecosto" si el cliente debe autorizarlo.
              </p>
            )}
          </>
        ) : (
          <>
            <Textarea
              label="Descripción del arreglo"
              name="descripcion"
              rows={2}
              required
              placeholder="Ej: Reparación de base dañada"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
            />
            <Input
              label="Precio aplicado"
              name="precio_custom"
              type="number"
              min="0"
              required
              placeholder="Ej: 15000"
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
          </>
        )}

        {/* Marca de sobrecosto */}
        <label className="flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={esSobrecosto}
            onChange={e => setEsSobrecosto(e.target.checked)}
            className="w-4 h-4 accent-black"
          />
          <span className="text-sm font-semibold text-black">
            Es sobrecosto — requiere autorización del cliente
          </span>
        </label>
      </div>
    </Modal>
  );
}
