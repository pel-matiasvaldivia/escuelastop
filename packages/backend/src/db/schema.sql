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
  role          TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador','instructor')),
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

-- Rol 'instructor' (Fase 2): da capacitación y controla los exámenes. Se scopea
-- por sucursal igual que un operador. Ampliamos el CHECK en bases ya creadas.
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin','operador','instructor'));

-- NOTA: las migraciones idempotentes de la Fase 2 (columnas/constraints sobre
-- exam_templates, training_courses, exam_sessions, course_students) viven al FINAL
-- del archivo, después de que esas tablas se crean. Ubicarlas antes rompía la
-- primera migración en una base nueva (referenciaban tablas aún inexistentes).

-- ===========================================================================
-- FASE 2 — Capacitación, evaluación teórica/práctica y certificación.
--
-- Flujo: se arma un CURSO (training_courses) en una sucursal a
-- cargo de un instructor; se matriculan ALUMNOS (course_students), cada uno con
-- un código único. El instructor HABILITA el examen teórico (exam_sessions), el
-- alumno lo rinde en una tablet con DNI + código, la plataforma corrige solo, el
-- instructor VALIDA. Se registra además la evaluación PRÁCTICA (rúbrica). Al
-- aprobar ambas, se emite un CERTIFICADO con firma electrónica + QR verificable.
-- ===========================================================================

-- Banco de examen por tipo de licencia (B1, D1, E1, ...). Cada categoría tiene
-- su propio banco: el examen es distinto según el tipo de curso.
CREATE TABLE IF NOT EXISTS exam_banks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria            TEXT UNIQUE NOT NULL,          -- clave del tipo (ej: B1, D1, E1)
  nombre               TEXT NOT NULL,
  descripcion          TEXT,
  preguntas_por_examen INT  NOT NULL DEFAULT 10,      -- cuántas se sortean por intento
  nota_minima          INT  NOT NULL DEFAULT 70,      -- % para aprobar
  tiempo_limite_min    INT  NOT NULL DEFAULT 30,
  intentos_max         INT  NOT NULL DEFAULT 2,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preguntas de cada banco (opción múltiple).
CREATE TABLE IF NOT EXISTS exam_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id     UUID NOT NULL REFERENCES exam_banks(id) ON DELETE CASCADE,
  enunciado   TEXT NOT NULL,
  opciones    JSONB NOT NULL,                 -- array de strings
  correcta    INT  NOT NULL,                  -- índice (0-based) de la opción correcta
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  orden       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_questions_bank ON exam_questions(bank_id);

-- Plantillas de examen: preset con nombre que toma preguntas de UNA categoría
-- (bank) y define los parámetros del examen (cuántas preguntas, nota mínima,
-- tiempo, intentos). Una misma categoría puede tener varias plantillas
-- (ej: "B1 — examen final" y "B1 — simulacro").
CREATE TABLE IF NOT EXISTS exam_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               TEXT NOT NULL,
  bank_id              UUID NOT NULL REFERENCES exam_banks(id) ON DELETE CASCADE,
  preguntas_por_examen INT  NOT NULL DEFAULT 10,
  nota_minima          INT  NOT NULL DEFAULT 70,
  tiempo_limite_min    INT  NOT NULL DEFAULT 30,
  intentos_max         INT  NOT NULL DEFAULT 2,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_templates_bank ON exam_templates(bank_id);

-- Cursos / cohortes: una instancia concreta de capacitación, en una sucursal, a
-- cargo de un instructor, con el banco de examen que le corresponde.
CREATE TABLE IF NOT EXISTS training_courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,                -- ej: "B1 — Agosto Casa Central"
  course_id     TEXT,                         -- id del catálogo (catalog.ts), informativo
  bank_id       UUID REFERENCES exam_banks(id),        -- legacy: categoría directa
  template_id   UUID REFERENCES exam_templates(id) ON DELETE SET NULL, -- plantilla de examen
  sede          TEXT,
  instructor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  cupo_maximo   INT,                          -- asientos; NULL = sin límite
  fecha_inicio  DATE,
  fecha_fin     DATE,
  estado        TEXT NOT NULL DEFAULT 'abierto'
                CHECK (estado IN ('abierto','en_curso','cerrado','cancelado')),
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_training_courses_sede ON training_courses(sede);

-- Alumnos matriculados en un curso. Puede venir de una inscripción de la
-- Fase 1 (enrollment) o cargarse a mano. Cada alumno tiene un código único con
-- el que inicia el examen en la tablet.
CREATE TABLE IF NOT EXISTS course_students (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  enrollment_id      UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  full_name          TEXT NOT NULL,
  dni                TEXT NOT NULL,
  codigo             TEXT NOT NULL,           -- código único para iniciar el examen
  estado             TEXT NOT NULL DEFAULT 'cursando'
                     CHECK (estado IN ('cursando','teoria_aprobada','teoria_desaprobada',
                                       'aprobado','desaprobado','baja')),
  baja_motivo        TEXT,                    -- por qué se dio de baja (abandono, etc.)
  baja_at            TIMESTAMPTZ,             -- cuándo se dio de baja
  practica_aprobada  BOOLEAN,                 -- NULL = sin evaluar aún
  practica_rubrica   JSONB,                   -- items evaluados (habilidades/maniobras)
  practica_por       TEXT,
  practica_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_course_id, dni)
);
CREATE INDEX IF NOT EXISTS idx_course_students_course ON course_students(training_course_id);

-- Intentos de examen teórico. El instructor lo habilita; el alumno lo rinde en
-- la tablet; la plataforma recoge el resultado; el instructor lo valida.
CREATE TABLE IF NOT EXISTS exam_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_student_id UUID NOT NULL REFERENCES course_students(id) ON DELETE CASCADE,
  bank_id           UUID NOT NULL REFERENCES exam_banks(id),
  nota_minima       INT,                      -- snapshot del % para aprobar al habilitar
  estado            TEXT NOT NULL DEFAULT 'habilitado'
                    CHECK (estado IN ('habilitado','en_curso','entregado','validado','anulado')),
  preguntas         JSONB,                    -- snapshot de las preguntas presentadas
  respuestas        JSONB,                    -- respuestas del alumno (índices)
  puntaje           INT,                      -- % obtenido
  aprobado          BOOLEAN,
  habilitado_por    TEXT,                     -- instructor que dio inicio
  validado_por      TEXT,                     -- instructor que validó/cerró
  habilitado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  iniciado_at       TIMESTAMPTZ,
  entregado_at      TIMESTAMPTZ,
  validado_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions(course_student_id);

-- Certificados con firma electrónica (HMAC del contenido) + QR verificable.
CREATE TABLE IF NOT EXISTS certificates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_student_id UUID NOT NULL REFERENCES course_students(id) ON DELETE CASCADE,
  serial            TEXT UNIQUE NOT NULL,     -- número legible (ej: STOP-2026-000123)
  codigo_verif      TEXT UNIQUE NOT NULL,     -- token del QR (URL pública de verificación)
  firma             TEXT NOT NULL,            -- HMAC del contenido (firma electrónica)
  datos             JSONB NOT NULL,           -- snapshot: alumno, dni, curso, categoría, nota, fechas, instructor
  emitido_por       TEXT NOT NULL,
  emitido_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado           BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(course_student_id);

-- Clases dictadas de un curso (una fila por fecha de clase). Sirven para tomar
-- asistencia: cada clase tiene su registro de presentes/ausentes por alumno.
CREATE TABLE IF NOT EXISTS course_classes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  fecha              DATE NOT NULL,
  tema               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_course_classes_course ON course_classes(training_course_id);

-- Asistencia por alumno en cada clase. presente = TRUE/FALSE.
CREATE TABLE IF NOT EXISTS class_attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          UUID NOT NULL REFERENCES course_classes(id) ON DELETE CASCADE,
  course_student_id UUID NOT NULL REFERENCES course_students(id) ON DELETE CASCADE,
  presente          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, course_student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_attendance_class ON class_attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_class_attendance_student ON class_attendance(course_student_id);

-- ===========================================================================
-- Migraciones idempotentes de la Fase 2 (para bases ya creadas).
-- Van al FINAL: referencian tablas que se crean más arriba en este mismo archivo.
-- En una base nueva son no-ops (las columnas ya existen en el CREATE TABLE).
-- ===========================================================================

-- Plantilla de examen del curso + nota mínima snapshot en la sesión.
ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES exam_templates(id) ON DELETE SET NULL;
ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS nota_minima INT;

-- Cupo de asientos por curso y baja de alumnos.
ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS cupo_maximo INT;
ALTER TABLE course_students
  ADD COLUMN IF NOT EXISTS baja_motivo TEXT;
ALTER TABLE course_students
  ADD COLUMN IF NOT EXISTS baja_at TIMESTAMPTZ;
-- Estado 'baja' para el alumno que abandona o se da de baja (conserva historial).
ALTER TABLE course_students DROP CONSTRAINT IF EXISTS course_students_estado_check;
ALTER TABLE course_students
  ADD CONSTRAINT course_students_estado_check
  CHECK (estado IN ('cursando','teoria_aprobada','teoria_desaprobada','aprobado','desaprobado','baja'));

-- ---------------------------------------------------------------------------
-- Matriculación automática (Fase 1 → Fase 2).
-- Cuando el alumno paga la seña y elige un CURSO ABIERTO concreto en su sucursal,
-- se lo matricula automáticamente en ese cohorte (course_students) y se guarda
-- acá la referencia para que administración vea, desde la inscripción, en qué
-- cohorte quedó y el estado del cupo.
-- ---------------------------------------------------------------------------
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS training_course_id UUID REFERENCES training_courses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_training_course ON enrollments(training_course_id);

-- La seña es un ANTICIPO: el alumno queda matriculado pero debe completar el
-- resto del pago de forma presencial. `pago_completo` lo marca administración
-- cuando cobra el saldo; recién ahí se HABILITA el código del alumno para rendir.
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS pago_completo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS pago_completo_at TIMESTAMPTZ;
