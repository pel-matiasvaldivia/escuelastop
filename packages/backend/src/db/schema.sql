-- Esquema de base de datos — Agente WhatsApp Escuela STOP
-- Se ejecuta automáticamente al levantar el contenedor de Postgres (docker-compose).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Contactos / Leads: una persona que escribió por WhatsApp.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id         TEXT UNIQUE NOT NULL,          -- número en formato open-wa (54911...@c.us)
  phone         TEXT,                          -- número normalizado +54...
  full_name     TEXT,
  dni           TEXT,
  age           INT,
  preferred_sede TEXT,
  interest      TEXT,                          -- curso/categoría de interés
  consent_given BOOLEAN NOT NULL DEFAULT FALSE, -- consentimiento Ley 25.326
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Mensajes: historial completo de la conversación (entrantes y salientes).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender      TEXT NOT NULL CHECK (sender IN ('user', 'bot', 'agent')), -- agent = operador humano
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at);

-- ---------------------------------------------------------------------------
-- Inscripciones: se crea cuando el lead avanza hacia inscribirse.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  course      TEXT,                            -- p.ej. "Licencia particular B1"
  sede        TEXT,
  status      TEXT NOT NULL DEFAULT 'nuevo'
              CHECK (status IN ('nuevo','contactado','inscripto','pagado','completado','cancelado')),
  form_token  UUID UNIQUE DEFAULT gen_random_uuid(), -- para el link de formulario prellenado
  notes       TEXT,
  -- ---- Pago de la seña (GATE previo a elegir sucursal/turno) ----
  -- La sucursal y el turno solo se guardan una vez que payment_status = 'aprobado'.
  payment_status TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (payment_status IN ('pendiente','aprobado','rechazado')),
  payment_id     TEXT,        -- id del pago en el proveedor (Mercado Pago)
  payment_amount INT,         -- monto de la seña en ARS
  paid_at        TIMESTAMPTZ, -- momento en que se confirmó el pago
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_payment ON enrollments(payment_status);

-- ---------------------------------------------------------------------------
-- Usuarios del dashboard (administración).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
