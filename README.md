# Agente WhatsApp + Dashboard — Escuela de Manejo STOP

Agente de atención virtual por WhatsApp para la Escuela de Manejo STOP. Responde
las consultas de inscripción a los cursos de manejo, capta los datos del
interesado (modo **híbrido**) y deriva a un formulario de inscripción. Incluye un
**dashboard de administración** para gestionar leads/inscripciones y tomar
contacto directo con quienes escribieron.

## Arquitectura

```
┌──────────────┐   mensajes   ┌───────────────────────────┐
│  WhatsApp    │◄────────────►│  Backend (Node + TS)      │
│  (open-wa)   │              │  - Canal WhatsApp         │
└──────────────┘              │  - Agente (Claude)        │
                              │  - API REST               │
┌──────────────┐   REST       │                           │      ┌────────────┐
│  Dashboard   │◄────────────►│                           │◄────►│ PostgreSQL │
│  (Next.js)   │              └───────────────────────────┘      └────────────┘
└──────────────┘
```

- **`packages/backend`** — API + canal de WhatsApp + agente Claude.
  - `whatsapp/` — canal detrás de la interfaz `MessagingChannel` (hoy `open-wa`;
    mañana Meta Cloud API sin tocar el resto).
  - `agent/` — integración con Claude y **base de conocimiento** de STOP.
  - `services/` — acceso a datos (contactos, mensajes, inscripciones).
  - `routes/` — API REST que consume el dashboard.
  - `db/schema.sql` — esquema de la base.
- **`packages/dashboard`** — panel de administración en Next.js.

> ⚠️ **Sobre open-wa:** automatiza WhatsApp Web y **no es una API oficial** de
> Meta. Va contra los Términos de Servicio de WhatsApp y **existe riesgo de baneo
> del número**. Es adecuado para el MVP; para producción a escala conviene migrar
> a la **Meta Cloud API** implementando `MessagingChannel` con ese proveedor.

## Puesta en marcha

Requisitos: Node 20+, Docker (para Postgres), una API key de Anthropic.

```bash
# 1. Variables de entorno
cp .env.example .env               # completar ANTHROPIC_API_KEY
cp packages/dashboard/.env.local.example packages/dashboard/.env.local

# 2. Base de datos
npm run db:up                      # levanta Postgres y aplica schema.sql

# 3. Dependencias
npm install

# 4. Backend (muestra el QR de WhatsApp la primera vez)
npm run dev:backend

# 5. Dashboard (en otra terminal)
npm run dev:dashboard              # http://localhost:3000
```

La primera vez, escaneá el QR que aparece en la consola del backend con el
WhatsApp del número dedicado para vincular la sesión.

## Estado actual (andamiaje MVP)

Implementado:
- Estructura de monorepo, base de datos y configuración.
- Canal de WhatsApp con open-wa detrás de una interfaz intercambiable.
- **Catálogo estructurado** de cursos (`agent/catalog.ts`) como única fuente de
  verdad: Particular B1, Profesional Renovación/Ampliación, Solo Prácticas,
  Avanzado, Teoría sola y Alquiler del auto (con turnos, precios, cuotas, seña,
  documentos y campos de formulario requeridos por curso).
- Agente Claude cuya base de conocimiento se **genera a partir del catálogo**.
- **Formulario de inscripción dinámico** (`/inscripcion/[token]`): los campos y
  documentos que se piden cambian según el curso elegido. Modo híbrido: llega
  prellenado con lo captado en el chat.
- **Gate de pago de la seña**: el alumno debe pagar la seña ANTES de poder elegir
  sucursal y turno (evita reservas de gente que después no se presenta). El pago
  se hace con **Mercado Pago** (o un proveedor mock en desarrollo) y la selección
  de turno se habilita solo cuando el pago está aprobado, validado también en el
  backend (`saveScheduleAfterPayment`).
- Persistencia de contactos, conversaciones e inscripciones.
- API REST (incluye `/api/catalog`) y dashboard con bandeja de
  leads/inscripciones y chat para contacto directo.

## Roadmap (próximos pasos)

- [ ] **Autenticación** del dashboard (`admin_users`) — pendiente antes de producción.
- [ ] **Extracción estructurada** de datos del chat (nombre, DNI, curso) con
      tool-use de Claude, para completar `contacts`/`enrollments` automáticamente.
- [ ] **Persistir datos personales y adjuntos** del formulario (nombre, DNI, foto
      de licencia/DNI) en el paso 1, no solo sucursal/turno.
- [ ] **Firmar/validar el webhook de Mercado Pago** (x-signature) antes de producción.
- [ ] Configurar **Mercado Pago real** (`PAYMENT_PROVIDER=mercadopago` + `MP_ACCESS_TOKEN`)
      y confirmar el **monto de seña** de cada curso (hoy $50.000, a validar en Particular).
- [ ] **Handoff a humano**: pausar el bot cuando un operador toma la conversación.
- [ ] **Plantillas de WhatsApp** aprobadas por Meta para mensajes proactivos.
- [ ] **Métricas** (leads por curso/sede, conversión) y exportación a Excel.
- [ ] **Cumplimiento Ley 25.326**: consentimiento, política de privacidad, opt-out.
- [ ] Migración a **Meta Cloud API** para producción.

## Cursos (fuente de la base de conocimiento)

Ver `packages/backend/src/agent/knowledge.ts`. Contiene los datos oficiales:
curso Particular B1 (principiantes) y Teoría Profesional (Renovación / Ampliación),
con turnos de la sucursal Guaymallén, precios, cuotas y proceso de reserva.
Mantener ese archivo actualizado cuando cambien precios o turnos.
