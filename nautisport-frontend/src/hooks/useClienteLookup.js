'use client';

import { useEffect, useState } from 'react';
import api from '@/services/api';
import { validarTelefono } from '@/lib/validaciones';

const IDLE = { status: 'idle', cliente: null, equipos: [] };

/**
 * Busca un cliente por teléfono (con debounce) al escribir en Recepción.
 *
 * Estados posibles:
 *  - idle:      teléfono vacío o con formato inválido (no se consulta)
 *  - buscando:  consulta en curso
 *  - encontrado: existe en la BD → { cliente, equipos: [...] }
 *  - nuevo:     formato válido pero no existe en la BD
 */
export function useClienteLookup(telefono, { delay = 500 } = {}) {
  const [lookup, setLookup] = useState(IDLE);

  useEffect(() => {
    if (validarTelefono(telefono)) {
      setLookup(IDLE);
      return;
    }

    setLookup({ status: 'buscando', cliente: null, equipos: [] });

    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get('/clientes', { params: { telefono: telefono.trim() }, signal: controller.signal })
        .then(async (res) => {
          const cliente = res.data[0] || null;
          if (!cliente) {
            setLookup({ status: 'nuevo', cliente: null, equipos: [] });
            return;
          }
          setLookup({ status: 'encontrado', cliente, equipos: [] });
          // Cargar los equipos ya registrados de este cliente
          const resEquipos = await api.get(`/clientes/${cliente.id_cliente}/equipos`, {
            signal: controller.signal,
          });
          setLookup({ status: 'encontrado', cliente, equipos: resEquipos.data });
        })
        .catch((err) => {
          // Ignorar cancelaciones por debounce o desmontaje
          if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
          console.error('Error al buscar cliente:', err);
          setLookup({ status: 'error', cliente: null, equipos: [] });
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [telefono, delay]);

  return lookup;
}
