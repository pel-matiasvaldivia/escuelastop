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
│  (Baileys)   │              │  - Canal WhatsApp         │
└──────────────┘              │  - Agente (Claude)        │
                              │  - API REST               │
┌──────────────┐   REST       │                           │      ┌────────────┐
│  Dashboard   │◄────────────►│                           │◄────►│ PostgreSQL │
│  (Next.js)   │              └───────────────────────────┘      └────────────┘
└──────────────┘
```

- **`packages/backend`** — API + canal de WhatsApp + agente Claude.
  - `whatsapp/` — canal detrás de la interfaz `MessagingChannel` (hoy `Baileys`;
    mañana Meta Cloud API sin tocar el resto).
  - `agent/` — integración con Claude y **base de conocimiento** de STOP.
  - `services/` — acceso a datos (contactos, mensajes, inscripciones).
  - `routes/` — API REST que consume el dashboard.
  - `db/schema.sql` — esquema de la base.
- **`packages/dashboard`** — panel de administración en Next.js.

> ⚠️ **Sobre Baileys:** habla el protocolo multi-device de WhatsApp por WebSocket
> (sin navegador), pero **no es una API oficial** de Meta. Va contra los Términos
> de Servicio de WhatsApp y **existe riesgo de baneo del número**. Es adecuado
> para el MVP; para producción a escala conviene migrar a la **Meta Cloud API**
> implementando `MessagingChannel` con ese proveedor.

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
- Canal de WhatsApp con **Baileys** (protocolo multi-device por WebSocket, sin
  navegador) detrás de una interfaz intercambiable.
- **Catálogo estructurado** de cursos (`agent/catalog.ts`) como única fuente de
  verdad: Particular B1, Profesional Renovación/Ampliación, Solo Prácticas,
  Avanzado, Teoría sola y Alquiler del auto (con turnos, precios, cuotas, seña,
  documentos y campos de formulario requeridos por curso).
- Agente Claude cuya base de conocimiento se **genera a partir del catálogo** y
  que, mediante **tool-use**, crea la inscripción y le envía a la persona el
  **link del formulario** cuando quiere avanzar. El agente NO pide datos ni fotos
  por el chat: solo responde requisitos y deriva al formulario.
- **Formulario de inscripción dinámico** (`/inscripcion/[token]`): los campos y
  documentos que se piden cambian según el curso elegido. Es donde el alumno
  carga todos sus datos y **sube las fotos de DNI/licencia** (persistidas en la
  tabla `documents` vía subida multipart).
- **Verificación de vigencia de la licencia**: en los cursos que requieren
  licencia, el formulario pide la fecha de vencimiento y aplica la regla de 90
  días (`services/license.ts`). Si está **vencida o próxima a vencer (≤ 90 días)**,
  el trámite NO avanza al pago: queda en estado `pendiente_verificacion` y
  administración lo toma. Además, si hay API key, se usa **Claude vision** para
  leer la fecha en la foto y cotejarla con la declarada (nota anti-fraude).
- **Gate de pago de la seña**: el alumno debe pagar la seña ANTES de poder elegir
  sucursal y turno (evita reservas de gente que después no se presenta). El pago
  se hace con **Mercado Pago** (o un proveedor mock en desarrollo) y la selección
  de turno se habilita solo cuando el pago está aprobado, validado también en el
  backend (`saveScheduleAfterPayment`).
- Persistencia de contactos, conversaciones e inscripciones.
- API REST (incluye `/api/catalog`) y dashboard con bandeja de
  leads/inscripciones y chat para contacto directo.
- **Autenticación del dashboard** (`admin_users`): login con email/contraseña,
  contraseñas con scrypt y sesión por token JWT (HS256). Las rutas de
  administración de la API requieren `Authorization: Bearer <token>`; las rutas
  públicas del formulario del alumno y los webhooks quedan abiertas.

## Despliegue con Docker

El repo incluye un stack completo (`docker-compose.yml`): Postgres + backend
(API/agente/WhatsApp) + dashboard. **Por defecto tira de las imágenes publicadas
en GHCR** (el workflow las construye en cada push a `main`):

```bash
cp .env.example .env          # completar ANTHROPIC_API_KEY, JWT_SECRET, etc.
docker login ghcr.io -u <usuario>   # si los packages son privados (PAT read:packages)
docker compose pull           # baja las imágenes de GHCR
docker compose up -d          # levanta los 3 servicios
docker compose exec backend npm run seed:admin   # crea el usuario admin
```

Para **construir localmente** en vez de usar GHCR:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

- Dashboard: http://localhost:3000 · API: http://localhost:3001 · Postgres: 5432
- Los documentos subidos y la sesión de WhatsApp se persisten en volúmenes
  (`uploads`, `wa_session`).
- `NEXT_PUBLIC_API_URL` se hornea en el build del dashboard: debe ser una URL
  del backend **alcanzable desde el navegador** del operador. En las imágenes de
  GHCR se toma de la variable de repositorio `NEXT_PUBLIC_API_URL`.

### Vincular WhatsApp desde el panel

El panel tiene una pestaña **WhatsApp** (`/whatsapp`) que muestra el **código QR**
para escanear desde el celular del número de la escuela. Estados: desconectado →
iniciando → esperando escaneo → conectado. Desde ahí también se puede
**desvincular** el número.

Una vez vinculado, poné `WA_ENABLED=true` para que el canal se reconecte solo al
arrancar reusando las credenciales del volumen `wa_session`.

> ⚠️ **WhatsApp en Docker:** Baileys no necesita navegador, así que la imagen no
> lleva Chromium. La sesión queda persistida en el volumen `wa_session`, por lo
> que solo hay que escanear el QR la primera vez. Para producción a escala,
> migrar a la Meta Cloud API.

### Imágenes en GHCR

El workflow `.github/workflows/docker-publish.yml` construye y publica las
imágenes en el GitHub Container Registry en cada push a `main` y en cada tag
`vX.Y.Z`:

- `ghcr.io/<owner>/<repo>-backend`
- `ghcr.io/<owner>/<repo>-dashboard`

El `docker-compose.yml` ya apunta a estas imágenes (`pull_policy: always`). Podés
fijar una versión concreta con `IMAGE_TAG` (por defecto `latest`) y sobreescribir
el registro con `REGISTRY`. La URL pública del backend para el build del dashboard
se toma de la variable de repositorio `NEXT_PUBLIC_API_URL` (Settings → Secrets
and variables → Actions → Variables); cambiarla requiere re-correr el workflow.

## Autenticación del dashboard

Las rutas del panel están protegidas. Hay dos formas de crear el usuario admin:

**a) Automático al arrancar (recomendado con Docker).** Definí `ADMIN_EMAIL` y
`ADMIN_PASSWORD` en el `.env`; el backend crea/actualiza ese usuario en cada
arranque (idempotente):

```env
ADMIN_EMAIL=admin@escuelastop.com.ar
ADMIN_PASSWORD=una-clave-segura
```

**b) Manual, con el seed:**

```bash
ADMIN_EMAIL=admin@escuelastop.com.ar ADMIN_PASSWORD=una-clave-segura \
  npm run seed:admin --workspace @escuelastop/backend
# o dentro del contenedor:
docker compose exec -e ADMIN_EMAIL=admin@escuelastop.com.ar \
  -e ADMIN_PASSWORD='una-clave-segura' db \
  psql -U stop -d escuelastop   # (o el seed compilado del backend)
```

Luego ingresá en `http://localhost:3000/login`. En producción, definí un
`JWT_SECRET` largo y aleatorio (ver `.env.example`).

## Roadmap (próximos pasos)

- [x] **Autenticación** del dashboard (`admin_users`).
- [x] **Empaquetado Docker** (compose con db + backend + dashboard) y **CI** que
      publica imágenes en GHCR.
- [ ] **Extracción estructurada** de datos del chat (nombre, DNI, curso) con
      tool-use de Claude, para completar `contacts`/`enrollments` automáticamente.
- [ ] **Ver los documentos en el dashboard** (ya existe `GET /enrollments/:id/documents`
      y `GET /documents/:id/file`; falta la UI en la ficha del alumno).
- [ ] **Firmar/validar el webhook de Mercado Pago** (x-signature) antes de producción.
- [ ] **Almacenamiento de archivos**: hoy en disco local (`uploads/`); para
      producción usar S3/almacenamiento gestionado con URLs firmadas.
- [ ] Configurar **Mercado Pago real** (`PAYMENT_PROVIDER=mercadopago` + `MP_ACCESS_TOKEN`)
      y confirmar el **monto de seña** de cada curso (hoy $50.000, a validar en Particular).
- [ ] **Handoff a humano**: pausar el bot cuando un operador toma la conversación.
- [ ] **Plantillas de WhatsApp** aprobadas por Meta para mensajes proactivos.
- [ ] **Métricas** (leads por curso/sede, conversión) y exportación a Excel.
- [ ] **Cumplimiento Ley 25.326**: consentimiento, política de privacidad, opt-out.
- [ ] Migración a **Meta Cloud API** para producción (canal oficial, sin riesgo
      de baneo; se implementa la misma interfaz `MessagingChannel`).

## Cursos (fuente de la base de conocimiento)

Ver `packages/backend/src/agent/knowledge.ts`. Contiene los datos oficiales:
curso Particular B1 (principiantes) y Teoría Profesional (Renovación / Ampliación),
con turnos de la sucursal Guaymallén, precios, cuotas y proceso de reserva.
Mantener ese archivo actualizado cuando cambien precios o turnos.
