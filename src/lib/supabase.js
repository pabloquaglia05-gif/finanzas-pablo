import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// SQL para crear las tablas — ejecutar en Supabase SQL Editor
export const SQL_SETUP = `
-- Categorías
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Ingreso', 'Gasto')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar categorías por defecto
INSERT INTO categorias (nombre, tipo) VALUES
('Sueldo', 'Ingreso'), ('Freelance / Honorarios', 'Ingreso'),
('Alquiler cobrado', 'Ingreso'), ('Inversiones', 'Ingreso'),
('Bono / Aguinaldo', 'Ingreso'), ('Reembolso', 'Ingreso'),
('Otros Ingresos', 'Ingreso'),
('Alimentación', 'Gasto'), ('Vivienda / Alquiler', 'Gasto'),
('Transporte', 'Gasto'), ('Salud', 'Gasto'),
('Educación', 'Gasto'), ('Entretenimiento', 'Gasto'),
('Ropa / Indumentaria', 'Gasto'), ('Tecnología', 'Gasto'),
('Tarjeta de Crédito', 'Gasto'), ('Servicios (luz/gas/internet)', 'Gasto'),
('Seguros', 'Gasto'), ('Gimnasio', 'Gasto'),
('Viajes', 'Gasto'), ('Otros Gastos', 'Gasto')
ON CONFLICT DO NOTHING;

-- Movimientos (Registro Mensual)
CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Ingreso', 'Gasto')),
  monto DECIMAL(12,2) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tarjeta de Crédito
CREATE TABLE IF NOT EXISTS tarjeta_credito (
  id SERIAL PRIMARY KEY,
  fecha_compra DATE NOT NULL,
  tarjeta TEXT NOT NULL CHECK (tarjeta IN ('BBVA', 'Mercado Pago')),
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tipo_pago TEXT NOT NULL CHECK (tipo_pago IN ('Cuotas', 'Pago Único')),
  monto_total DECIMAL(12,2) NOT NULL,
  cuotas INTEGER DEFAULT 1,
  valor_cuota DECIMAL(12,2) NOT NULL,
  mes_a_pagar TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pagado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`
