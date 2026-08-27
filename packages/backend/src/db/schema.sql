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
  email         TEXT,
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
              CHECK (status IN ('nuevo','contactado','inscripto','pagado','completado',
                                'cancelado','pendiente_verificacion')),
  form_token  UUID UNIQUE DEFAULT gen_random_uuid(), -- para el link de formulario prellenado
  notes       TEXT,
  -- ---- Verificación de la licencia (para cursos profesionales) ----
  license_expiry DATE,          -- fecha de vencimiento declarada de la licencia
  license_status TEXT CHECK (license_status IN ('vigente','proxima','vencida')),
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
-- Documentos adjuntos (foto de licencia, foto de DNI, apto médico).
-- Los sube el ALUMNO desde el formulario; el agente de WhatsApp no los pide.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('foto_licencia','foto_dni','apto_medico')),
  file_path     TEXT NOT NULL,   -- ruta en disco (o key de almacenamiento)
  mime_type     TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_enrollment ON documents(enrollment_id);

-- ---------------------------------------------------------------------------
-- Usuarios del dashboard (administración).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador')),
  -- Sucursal a la que pertenece un operador (nombre exacto de la sucursal, igual
  -- que enrollments.sede). NULL para el admin, que ve todas las sucursales.
  sucursal      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Migraciones idempotentes (se aplican también sobre bases ya creadas).
-- ---------------------------------------------------------------------------

-- Verificación manual de la licencia por parte de administración. Cuando es
-- TRUE, el formulario deja avanzar al pago aunque la licencia esté vencida o
-- próxima a vencer (administración revisó el caso y lo habilitó).
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS license_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Handoff a humano: cuando un operador toma la conversación, el bot deja de
-- responder a ese contacto hasta que se lo reactive desde el panel.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS bot_paused_at TIMESTAMPTZ;

-- Multi-sucursal: un operador solo ve las inscripciones de SU sucursal. El admin
-- (sucursal NULL) ve todas y puede reasignar inscriptos a otra sucursal.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS sucursal TEXT;
-- Filtro por sede (scoping por sucursal en el panel).
CREATE INDEX IF NOT EXISTS idx_enrollments_sede ON enrollments(sede);
