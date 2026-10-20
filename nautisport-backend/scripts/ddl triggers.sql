-- 1. Definición de Tipos Enumerados (ENUMs)
CREATE TYPE rol_usuario AS ENUM ('Administrador', 'Recepcion', 'Tecnico');
CREATE TYPE tipo_equipo_enum AS ENUM ('Ski', 'Snowboard', 'Otros');
CREATE TYPE estado_ot_enum AS ENUM ('Pendiente', 'En Mantención', 'Requiere Autorización', 'Finalizado', 'Entregado');

-- 2. Tabla de Usuarios y Roles (RBAC)
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Clientes
CREATE TABLE cliente (
    id_cliente SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20) NOT NULL, -- Formato estricto +569...
    email VARCHAR(150),
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Equipos
CREATE TABLE equipo (
    id_equipo SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
    tipo tipo_equipo_enum NOT NULL,
    marca_modelo VARCHAR(150) NOT NULL, -- Ej: Dynafit, Rossignol
    peso DECIMAL(5,2), -- Peso del deportista o ajuste DIN
    fijaciones VARCHAR(150),
    zapatos VARCHAR(150),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Catálogo Base de Servicios
CREATE TABLE servicio (
    id_servicio SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE, -- Ej: Afilar Cantos, Plastificar, Rectificar, Encerar, Regular, Colocar
    descripcion TEXT,
    precio_base INT NOT NULL DEFAULT 0 CHECK (precio_base >= 0),
    activo BOOLEAN DEFAULT TRUE
);

-- 6. Orden de Trabajo (Comanda / Etiqueta Digital)
CREATE TABLE orden_trabajo (
    id_orden SERIAL PRIMARY KEY,
    folio_fisico VARCHAR(20) UNIQUE, -- Mapeo opcional al talonario preimpreso (ej: 01920)
    id_cliente INT NOT NULL REFERENCES cliente(id_cliente),
    id_equipo INT NOT NULL REFERENCES equipo(id_equipo),
    id_tecnico_asignado INT REFERENCES usuario(id_usuario),
    fecha_recepcion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega_estimada TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_entrega_real TIMESTAMP WITH TIME ZONE,
    estado estado_ot_enum NOT NULL DEFAULT 'Pendiente',
    monto_inicial INT NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
    monto_total INT NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
    observaciones TEXT, -- Arreglos diversos o detalles de recepción
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Detalle de Servicios Aplicados y Sobrecostos
CREATE TABLE ot_detalle_servicio (
    id_detalle SERIAL PRIMARY KEY,
    id_orden INT NOT NULL REFERENCES orden_trabajo(id_orden) ON DELETE CASCADE,
    id_servicio INT REFERENCES servicio(id_servicio), -- Puede ser NULL si es un arreglo personalizado
    descripcion_custom VARCHAR(255),
    precio_aplicado INT NOT NULL CHECK (precio_aplicado >= 0),
    es_sobrecosto BOOLEAN DEFAULT FALSE, -- Flag clave para requerimientos de autorización
    fecha_agregado TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Bitácora e Historial de Trazabilidad
CREATE TABLE historial_estado (
    id_historial SERIAL PRIMARY KEY,
    id_orden INT NOT NULL REFERENCES orden_trabajo(id_orden) ON DELETE CASCADE,
    estado_anterior estado_ot_enum,
    estado_nuevo estado_ot_enum NOT NULL,
    id_usuario INT REFERENCES usuario(id_usuario),
    comentario TEXT,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Índices para Optimización de Consultas (RNF-04)
CREATE INDEX idx_cliente_telefono ON cliente(telefono);
CREATE INDEX idx_orden_cliente ON orden_trabajo(id_cliente);
CREATE INDEX idx_orden_estado ON orden_trabajo(estado);
CREATE INDEX idx_equipo_cliente ON equipo(id_cliente);

-- Inserción de servicios estándar derivados del talonario de NautiSport
INSERT INTO servicio (nombre, precio_base) VALUES
('Afilar Cantos', 0),
('Plastificar', 0),
('Rectificar', 0),
('Encerar', 0),
('Regular', 0),
('Colocar', 0);

CREATE OR REPLACE FUNCTION fn_actualizar_totales_ot()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orden_trabajo
    SET 
        monto_inicial = COALESCE((
            SELECT SUM(precio_aplicado) 
            FROM ot_detalle_servicio 
            WHERE id_orden = NEW.id_orden AND es_sobrecosto = FALSE
        ), 0),
        monto_total = COALESCE((
            SELECT SUM(precio_aplicado) 
            FROM ot_detalle_servicio 
            WHERE id_orden = NEW.id_orden
        ), 0)
    WHERE id_orden = NEW.id_orden;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_totales_ot
AFTER INSERT OR UPDATE OR DELETE ON ot_detalle_servicio
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_totales_ot();

CREATE OR REPLACE FUNCTION fn_registrar_cambio_estado()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.estado IS DISTINCT FROM NEW.estado) THEN
        INSERT INTO historial_estado (id_orden, estado_anterior, estado_nuevo, id_usuario)
        VALUES (NEW.id_orden, OLD.estado, NEW.estado, NEW.id_tecnico_asignado);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_registrar_cambio_estado
AFTER UPDATE ON orden_trabajo
FOR EACH ROW
EXECUTE FUNCTION fn_registrar_cambio_estado();