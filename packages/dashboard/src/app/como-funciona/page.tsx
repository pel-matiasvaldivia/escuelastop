'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../lib/api';

/**
 * "Cómo funciona": manual de usuario de todo el sistema. Está dividido en dos
 * partes:
 *   1) MANUAL POR MÓDULO — qué hace y cómo se usa cada solapa del panel
 *      (Conversaciones, Inscripciones, Caja, Capacitaciones, Configuración) y
 *      las pantallas públicas (formulario del alumno, kiosco de examen y
 *      verificación de certificados), con los roles que acceden a cada una.
 *   2) EL RECORRIDO DEL ALUMNO — el proceso de punta a punta, del primer
 *      WhatsApp a la licencia, como contexto del negocio.
 * Es material de referencia para el equipo; no consume datos.
 */

type Role = 'admin' | 'operador' | 'instructor' | 'alumno';
const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin', operador: 'Operador', instructor: 'Instructor', alumno: 'Alumno',
};
const ROLE_COLOR: Record<Role, string> = {
  admin: '#6d28d9', operador: '#2563a8', instructor: '#b9740f', alumno: '#1c8f4d',
};

interface ModuleDoc {
  id: string;
  icon: string;
  title: string;
  where: string;          // dónde está en el panel
  roles: Role[];
  intro: string;
  steps: { t: string; d: string }[];
  tips?: string[];
}

const MODULES: ModuleDoc[] = [
  {
    id: 'conversaciones',
    icon: '💬',
    title: 'Conversaciones',
    where: 'Primera solapa del menú',
    roles: ['admin', 'operador', 'instructor'],
    intro: 'Bandeja de todos los contactos que escribieron por WhatsApp. Desde acá seguís y respondés cada chat. El agente de IA contesta solo; cuando hace falta, un humano toma la conversación.',
    steps: [
      { t: 'Buscar un contacto', d: 'Usá el buscador para filtrar por nombre, teléfono, DNI o interés (curso por el que consultó).' },
      { t: 'Leer el estado del bot', d: 'Cada fila muestra 🤖 Bot (el agente responde solo) o ⏸️ Operador (un humano tomó la conversación y el bot está pausado para ese contacto).' },
      { t: 'Abrir el chat', d: 'Tocá la fila o "Ver conversación →" para ver el historial completo y escribir.' },
      { t: 'Responder como operador (handoff)', d: 'Al enviar un mensaje, el bot se pausa automáticamente para ese contacto: la conversación queda en manos del humano.' },
      { t: 'Devolver la conversación al bot', d: 'Cuando terminás, reactivá el bot desde la ficha del contacto para que vuelva a responder solo.' },
    ],
    tips: ['El operador ve los contactos de su sucursal; el admin ve todos.'],
  },
  {
    id: 'inscripciones',
    icon: '📋',
    title: 'Inscripciones',
    where: 'Solapa Inscripciones',
    roles: ['admin', 'operador'],
    intro: 'La bandeja central del negocio: todas las inscripciones, ya sean automáticas (el alumno completó el formulario y pagó la seña) o cargadas a mano desde el mostrador. La seña es un anticipo; el pago total se completa presencialmente.',
    steps: [
      { t: 'Leer los indicadores', d: 'Arriba, cuatro tarjetas: Inscripciones (total), Pre-inscriptos, Pago pendiente y Pago completo.' },
      { t: 'Buscar y filtrar', d: 'Buscá por nombre, apellido, DNI o teléfono; filtrá por tipo de curso y por rango de fecha de inscripción (Desde/Hasta). Se muestran 25 filas por página.' },
      { t: 'Entender la columna Pago', d: 'Muestra la seña (anticipo) y si todavía falta el pago total. La seña aprobada NO habilita el código del alumno todavía.' },
      { t: 'Registrar el pago total', d: 'Cuando el alumno completa el saldo en la sucursal, tocá "Registrar pago": se habilita su código para rendir y se le avisa por WhatsApp y mail.' },
      { t: 'Cargar una inscripción a mano', d: 'Botón "+ Nueva inscripción" para altas por teléfono o mostrador. Podés marcar la seña como ya cobrada en efectivo.' },
      { t: 'Reasignar de sucursal (admin)', d: 'El admin puede cambiar la sede de una inscripción desde el selector de la columna Sede.' },
    ],
    tips: [
      'Pre-inscripto = generó un cupón de Rapipago / Pago Fácil y todavía no lo abonó. Al acreditarse el pago pasa a inscripto.',
      'Los casos de licencia profesional vencida o próxima a vencer quedan "en verificación" para que administración los apruebe o rechace antes de seguir.',
    ],
  },
  {
    id: 'caja',
    icon: '💵',
    title: 'Caja',
    where: 'Solapa Caja',
    roles: ['admin', 'operador'],
    intro: 'Flujo de caja por sucursal: apertura y cierre del día, ingresos y egresos por medio de pago, y reportes. Sirve para el arqueo diario y para saber por dónde entra el dinero.',
    steps: [
      { t: 'Abrir la caja', d: 'Al empezar el día, ingresá el saldo inicial en efectivo y tocá "Abrir caja". No se puede tener dos cajas abiertas en la misma sucursal.' },
      { t: 'Registrar movimientos', d: 'En "Registrar movimiento": elegí Ingreso o Egreso, el medio (Efectivo, Mercado Pago, Pago Fácil, Rapipago, Transferencia, Tarjeta u Otro), el monto y un concepto.' },
      { t: 'Leer el reporte por medio', d: 'La tabla "Reporte por medio de pago" resume ingresos, egresos y neto por cada medio, para el rango de fechas que elijas (o el histórico).' },
      { t: 'Controlar el efectivo esperado', d: 'La caja abierta muestra el "Efectivo esperado" = saldo inicial + neto de movimientos en efectivo. Es el número contra el que se hace el arqueo.' },
      { t: 'Cerrar la caja (arqueo)', d: 'Al finalizar, tocá "Cerrar caja", contá el efectivo real e ingresalo. La sesión queda cerrada y guardada en el historial.' },
      { t: 'Revisar movimientos', d: 'La tabla "Movimientos" tiene filtros por tipo, medio y fecha, y paginación de 25 por página.' },
    ],
    tips: ['El operador gestiona la caja de su sucursal; el admin ve las de todas las sedes.'],
  },
  {
    id: 'capacitaciones',
    icon: '🎓',
    title: 'Capacitaciones',
    where: 'Solapa Capacitaciones (y sub-solapa Bancos)',
    roles: ['admin', 'instructor'],
    intro: 'Todo el cursado: armar cursos, matricular alumnos, tomar asistencia, evaluar teoría y práctica, y emitir el certificado. Los bancos y plantillas de examen se gestionan en la sub-solapa "Bancos".',
    steps: [
      { t: 'Preparar el banco de examen', d: 'En "Bancos", creá el banco de la categoría y cargá las preguntas (una por una o importando un CSV/Excel). Definí nota mínima, tiempo e intentos en la plantilla.' },
      { t: 'Crear un curso', d: 'Nuevo curso con categoría, sucursal, instructor, plantilla de examen, cupo de asientos (opcional) y fechas.' },
      { t: 'Matricular alumnos', d: 'Los alumnos llegan automáticamente desde una inscripción pagada, o se cargan a mano. Cada uno recibe un código único para rendir.' },
      { t: 'Tomar asistencia', d: 'Registrá la asistencia por clase. Si un alumno abandona, dalo de baja: conserva su historial y libera el asiento.' },
      { t: 'Examen teórico', d: 'El instructor habilita el examen; el alumno lo rinde en la tablet (solapa Examen) con su DNI + código. La plataforma sortea preguntas, corrige sola y el instructor valida.' },
      { t: 'Evaluación práctica', d: 'Cargá la rúbrica de manejo (controles, cambios, señales, estacionamiento, conducción defensiva) y marcá cada ítem como aprobado o pendiente.' },
      { t: 'Emitir el certificado', d: 'Con teoría y práctica aprobadas, se emite el certificado en PDF con firma electrónica y un QR verificable.' },
    ],
    tips: ['El instructor ve los cursos de su sucursal; el admin ve todos.'],
  },
  {
    id: 'configuracion',
    icon: '⚙️',
    title: 'Configuración',
    where: 'Solapa Configuración → General · WhatsApp · Usuarios',
    roles: ['admin'],
    intro: 'El panel de administración del sistema, solo para admin. Reúne los datos de la empresa, el servidor de correo, el agente de IA, la vinculación de WhatsApp y la gestión de usuarios.',
    steps: [
      { t: 'General — Empresa', d: 'Cargá nombre, CUIT, domicilio, email, teléfono y el logo. Estos datos aparecen en el formulario del alumno y en los certificados.' },
      { t: 'General — Correo (SMTP)', d: 'Configurá el servidor de correo con el que salen las notificaciones (host, puerto, usuario, contraseña y remitente). Usá "Enviar mail de prueba" para validarlo.' },
      { t: 'General — Agente de IA', d: 'Cargá la API key, el modelo y las instrucciones adicionales que guían al agente de WhatsApp.' },
      { t: 'WhatsApp', d: 'Vinculá el número escaneando el QR desde WhatsApp → Dispositivos vinculados. La pantalla muestra el estado de la conexión en vivo.' },
      { t: 'Usuarios', d: 'Dá de alta usuarios (admin, operador o instructor) por sucursal, reseteá contraseñas y eliminá cuentas.' },
    ],
    tips: ['Los secretos (contraseña SMTP y API key del agente) nunca se muestran: solo se indica que hay una "· guardada". Si dejás el campo vacío, se conserva la que ya estaba.'],
  },
  {
    id: 'publicas',
    icon: '🌐',
    title: 'Pantallas para el alumno',
    where: 'Enlaces públicos (sin login)',
    roles: ['alumno'],
    intro: 'Tres pantallas que usan los alumnos y el público, fuera del panel de administración.',
    steps: [
      { t: 'Formulario de inscripción', d: 'El agente envía un link personalizado por WhatsApp. El alumno completa sus datos, sube DNI/licencia, paga la seña y elige turno o cohorte.' },
      { t: 'Kiosco de examen (tablet)', d: 'En la solapa Examen, el alumno inicia el examen teórico con su DNI + código, responde y entrega. Corrige la plataforma.' },
      { t: 'Verificación de certificados', d: 'Cualquiera puede escanear el QR del certificado (o entrar a /verificar) y confirmar que es auténtico y que no fue anulado.' },
    ],
  },
];

/* --------------------------- Recorrido (contexto) --------------------------- */

type Accent = 'red' | 'amber' | 'green' | 'blue' | 'plain';

interface Step {
  n: number;
  accent: Accent;
  title: string;
  desc: string;
  chips: { label: string; kind?: 'who' | 'rec' | 'gate' }[];
}

const FASE1: Step[] = [
  {
    n: 1, accent: 'red', title: 'Consulta por WhatsApp',
    desc: 'El alumno escribe al número único de la escuela (la web y las redes convergen ahí). El agente de IA responde al instante, 24/7, con el catálogo real: cursos, precios, sucursales y requisitos.',
    chips: [{ label: 'Alumno + Agente IA', kind: 'who' }, { label: 'Sin mensajes sin responder' }],
  },
  {
    n: 2, accent: 'plain', title: 'Orientación y derivación',
    desc: 'Asesora según lo que necesita. Para profesionales confirma requisitos (B1/B2 con +1 año y +21) y deriva a la encargada de la sucursal. Un operador puede tomar la conversación: el bot se pausa solo.',
    chips: [{ label: 'Agente → Encargada', kind: 'who' }, { label: 'Handoff a humano' }],
  },
  {
    n: 3, accent: 'plain', title: 'Formulario prellenado',
    desc: 'El agente envía un link personalizado. El alumno completa sus datos y sube las fotos del DNI y, si corresponde, de la licencia — sin mandarlas por chat.',
    chips: [{ label: 'Alumno', kind: 'who' }, { label: 'Datos y documentos guardados', kind: 'rec' }],
  },
  {
    n: 4, accent: 'amber', title: 'Verificación de licencia (profesionales)',
    desc: 'Para renovaciones y profesionales, el sistema controla el vencimiento y coteja la foto con IA. Si está vencida o por vencer, el trámite queda en revisión y administración lo resuelve antes de seguir.',
    chips: [{ label: 'IA + Administración', kind: 'who' }, { label: 'Anti-fraude' }],
  },
  {
    n: 5, accent: 'red', title: 'Seña de reserva — el punto de control',
    desc: 'El alumno paga la seña por Mercado Pago (o cupón Rapipago / Pago Fácil). Recién con la seña aprobada se habilita elegir sucursal y turno. La seña es un anticipo: el saldo se completa en la sucursal.',
    chips: [{ label: 'Gate de pago', kind: 'gate' }, { label: 'Alumno', kind: 'who' }],
  },
  {
    n: 6, accent: 'green', title: 'Inscripción confirmada',
    desc: 'Queda registrada y asignada a una sucursal. También se puede cargar a mano desde el mostrador o por teléfono, registrando la seña en efectivo. El operador ve las de su sucursal; el admin ve todo y reasigna.',
    chips: [{ label: 'Alumno en el sistema', kind: 'rec' }, { label: 'Multi-sucursal' }],
  },
];

const FASE2: Step[] = [
  {
    n: 7, accent: 'plain', title: 'Curso y matrícula',
    desc: 'El instructor (o el admin) abre un curso — categoría, sucursal y la plantilla de examen de la categoría — con un cupo de asientos opcional, y matricula a los alumnos hasta llenarlo. Cada alumno recibe un código único para rendir.',
    chips: [{ label: 'Instructor', kind: 'who' }, { label: 'Cupo de asientos' }, { label: 'Código por alumno' }],
  },
  {
    n: 8, accent: 'plain', title: 'Capacitación y asistencia',
    desc: 'Clases teóricas presenciales y prácticas en el coche escuela o en el vehículo de la categoría (auto, camión, micro, maquinaria). Se registra la asistencia por clase. Si un alumno abandona, se lo da de baja: conserva su historial y libera el asiento.',
    chips: [{ label: 'Instructor + Alumno', kind: 'who' }, { label: 'Asistencia por clase' }],
  },
  {
    n: 9, accent: 'amber', title: 'Examen teórico en tablet',
    desc: 'El instructor habilita el examen; el alumno lo rinde en una tablet con su DNI + código. La plataforma sortea las preguntas del banco, corrige sola contra la nota mínima de la plantilla, y el instructor valida.',
    chips: [{ label: 'Instructor habilita · Alumno rinde', kind: 'who' }, { label: 'Nota registrada', kind: 'rec' }],
  },
  {
    n: 10, accent: 'amber', title: 'Evaluación práctica',
    desc: 'El instructor evalúa las habilidades de manejo con una rúbrica: tilda cada maniobra (controles, cambios, señales, estacionamiento, conducción defensiva) como aprobada o pendiente.',
    chips: [{ label: 'Instructor', kind: 'who' }, { label: 'Rúbrica registrada', kind: 'rec' }],
  },
  {
    n: 11, accent: 'green', title: 'Cierre y certificado',
    desc: 'Con teoría y práctica aprobadas se emite el certificado del curso: PDF con firma electrónica y un QR verificable que cualquiera puede escanear para confirmar que es auténtico.',
    chips: [{ label: 'Instructor', kind: 'who' }, { label: 'Certificado + QR', kind: 'rec' }],
  },
  {
    n: 12, accent: 'green', title: 'Licencia o renovación',
    desc: 'El último paso depende del curso que hizo el alumno. El certificado interno respalda la formación; la licencia oficial se obtiene según cada categoría (ver abajo).',
    chips: [{ label: 'Formación completa', kind: 'rec' }],
  },
];

interface RouteDoc {
  c: 'b1' | 'prof' | 'reno';
  title: string;
  sub: string;
  items: string[];
  where: string;
}

const ROUTES: RouteDoc[] = [
  {
    c: 'b1', title: 'Particular B1', sub: 'Autos · principiantes',
    items: [
      'Curso teórico + 11 prácticas en coche escuela.',
      'Se rinde teoría y práctica en la Municipalidad que corresponde al DNI.',
      'El municipio entrega el carnet (la escuela no lo emite).',
    ],
    where: 'El certificado del curso respalda la formación ante el municipio.',
  },
  {
    c: 'prof', title: 'Profesional por categoría', sub: 'D1 · D2/D3 · E1 · C1/C2 · E2 · paquete',
    items: [
      'Teórico nacional + práctica y evaluación en el vehículo.',
      'Se rinde en la escuela; habilita en todo el país (interjurisdiccional).',
      'Turnos y cursado se coordinan con la encargada de la sucursal.',
    ],
    where: 'Requiere B1/B2 (+1 año) y ser mayor de 21.',
  },
  {
    c: 'reno', title: 'Renovación / revalidación', sub: 'Profesional vigente',
    items: [
      'Teórico de 5 horas; se cursa, rinde y aprueba en la escuela.',
      'Los resultados se cargan a lncargentina.seguridadvial.gob.ar.',
      'Impacta en el sistema oficial en 1 a 3 días hábiles.',
    ],
    where: 'Elegí un turno del esquema y el sistema hace el resto.',
  },
];

const ACCENT: Record<Accent, string> = {
  red: '#d42f2f', amber: '#b9740f', green: '#1c8f4d', blue: '#2563a8', plain: '#cbd5e1',
};
const ROUTE_COLOR: Record<RouteDoc['c'], string> = { b1: '#2563a8', prof: '#b9740f', reno: '#1c8f4d' };

export default function ComoFuncionaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 880 }}>
      <p style={eyebrow}>Manual de usuario</p>
      <h1 style={{ margin: '0 0 6px', fontSize: 30, letterSpacing: '-0.01em' }}>
        Cómo funciona el sistema
      </h1>
      <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 16, maxWidth: '64ch' }}>
        Guía práctica de todo el panel: qué hace cada solapa y cómo se usa, quién accede a cada una,
        y el recorrido del alumno de punta a punta — del primer WhatsApp a la licencia. Es material
        de referencia para el equipo.
      </p>

      {/* Índice */}
      <nav style={{ ...card, padding: '14px 18px', marginTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>
          En esta guía
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MODULES.map((m) => (
            <a key={m.id} href={`#${m.id}`} style={tocLink}>
              <span aria-hidden>{m.icon}</span> {m.title}
            </a>
          ))}
          <a href="#recorrido" style={tocLink}><span aria-hidden>🧭</span> Recorrido del alumno</a>
          <a href="#rutas" style={tocLink}><span aria-hidden>🪪</span> Rutas a la licencia</a>
        </div>
      </nav>

      {/* Roles */}
      <section style={{ ...card, marginTop: 14 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Roles y accesos</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>
          El sistema es multi-sucursal. Lo que ve cada persona depende de su rol:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {([
            ['admin', 'Administración', 'Ve y gestiona todas las sucursales: inscripciones, caja, capacitaciones, configuración y usuarios. Puede reasignar inscripciones entre sedes.'],
            ['operador', 'Operador', 'Ve solo su sucursal: conversaciones, inscripciones y caja de su sede. Carga inscripciones y cobra señas.'],
            ['instructor', 'Instructor', 'Da la capacitación de su sucursal: cursos, asistencia, exámenes, evaluación práctica y certificados.'],
          ] as [Role, string, string][]).map(([r, h, d]) => (
            <div key={r} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <RoleTag role={r} big />
              <div style={{ fontSize: 14.5, fontWeight: 700, margin: '8px 0 4px' }}>{h}</div>
              <div style={{ fontSize: 13.5, color: '#64748b' }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Manual por módulo */}
      <Divider tag="MÓDULOS DEL PANEL" title="Cómo se usa cada solapa" />
      {MODULES.map((m) => <ModuleCard key={m.id} m={m} />)}

      {/* Recorrido del alumno */}
      <div id="recorrido" />
      <Divider tag="EL PROCESO" title="El recorrido del alumno, de punta a punta" />
      <Phase tag="FASE 1" title="De la consulta a la inscripción"
        sub="El agente de IA responde solo, sin perder ningún mensaje, y no deja avanzar hasta que están los datos y la seña." />
      <Timeline steps={FASE1} />
      <Phase tag="FASE 2" title="De la capacitación a la licencia"
        sub="El instructor arma el curso, toma la evaluación y cierra la formación con un certificado verificable." />
      <Timeline steps={FASE2} />

      {/* Rutas a la licencia */}
      <div id="rutas" />
      <h2 style={{ margin: '38px 0 2px', fontSize: 22 }}>El tramo final, según el curso</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 15 }}>
        Las categorías no terminan igual. Estas son las tres rutas hacia la licencia:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {ROUTES.map((r) => (
          <div key={r.c} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 12px', borderTop: `4px solid ${ROUTE_COLOR[r.c]}` }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{r.title}</div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>{r.sub}</div>
            </div>
            <ul style={{ margin: 0, padding: '10px 16px 14px 30px', display: 'grid', gap: 7 }}>
              {r.items.map((it, i) => <li key={i} style={{ fontSize: 14, color: '#475569' }}>{it}</li>)}
            </ul>
            <div style={{
              margin: '0 16px 16px', padding: '9px 11px', borderRadius: 8, fontSize: 12.5,
              color: '#475569', background: '#f8fafc', border: '1px dashed #e2e8f0',
            }}>{r.where}</div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: '38px 0 14px', fontSize: 20 }}>Lo que sostiene todo el recorrido</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[
          ['#d42f2f', 'Un solo número, cero pérdidas', 'El agente atiende cada consulta al instante; nada queda sin responder.'],
          ['#b9740f', 'Catálogo como fuente de verdad', 'Precios, cursos y sucursales se cargan una vez y alimentan agente, formulario y panel.'],
          ['#2563a8', 'Roles y sucursales', 'Admin ve todo; operador e instructor, solo su sucursal.'],
          ['#1c8f4d', 'Trazabilidad punta a punta', 'De la primera consulta al certificado: cada paso queda registrado.'],
        ].map(([color, h, p]) => (
          <div key={h} style={{ display: 'flex', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 6, flex: 'none' }} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{h}</div>
              <div style={{ fontSize: 13.5, color: '#64748b' }}>{p}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 30, padding: '12px 16px', borderRadius: 10, background: '#fffbeb',
        border: '1px solid #fde68a', color: '#92400e', fontSize: 13.5,
      }}>
        <strong>Alcance:</strong> la licencia oficial la emite siempre la autoridad (el municipio para B1,
        el sistema nacional para profesionales). La plataforma gestiona todo el proceso interno y el
        certificado del curso, que es el respaldo de la formación.
      </div>
    </div>
  );
}

/* -------------------------------- Componentes -------------------------------- */

function ModuleCard({ m }: { m: ModuleDoc }) {
  return (
    <section id={m.id} style={{ ...card, marginTop: 14, scrollMarginTop: 76 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center',
          fontSize: 21, background: '#f1f5f9', border: '1px solid var(--border)', flex: 'none',
        }} aria-hidden>{m.icon}</span>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{m.title}</h2>
          <div style={{ fontSize: 12.5, color: '#94a3b8', fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>{m.where}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {m.roles.map((r) => <RoleTag key={r} role={r} />)}
        </div>
      </div>

      <p style={{ margin: '12px 0 14px', color: '#475569', fontSize: 14.5 }}>{m.intro}</p>

      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {m.steps.map((s, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 12, alignItems: 'start' }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
              fontSize: 12.5, fontWeight: 700, background: '#eef2ff', color: '#4338ca', flex: 'none',
            }}>{i + 1}</span>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.t}. </span>
              <span style={{ color: '#64748b', fontSize: 14.5 }}>{s.d}</span>
            </div>
          </li>
        ))}
      </ol>

      {m.tips && m.tips.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {m.tips.map((t, i) => (
            <div key={i} style={{
              display: 'flex', gap: 9, padding: '9px 12px', borderRadius: 9,
              background: '#f8fafc', border: '1px solid var(--border)', fontSize: 13.5, color: '#475569',
            }}>
              <span aria-hidden>💡</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RoleTag({ role, big }: { role: Role; big?: boolean }) {
  const color = ROLE_COLOR[role];
  return (
    <span style={{
      fontSize: big ? 12 : 11, fontWeight: 700, letterSpacing: '0.02em',
      padding: big ? '3px 10px' : '2px 8px', borderRadius: 20,
      color, background: `${color}14`, border: `1px solid ${color}33`,
    }}>{ROLE_LABEL[role]}</span>
  );
}

function Divider({ tag, title }: { tag: string; title: string }) {
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#fff', background: '#16202f',
          padding: '4px 10px', borderRadius: 6, letterSpacing: '0.04em',
        }}>{tag}</span>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
      </div>
    </div>
  );
}

function Phase({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#fff', background: '#334155',
          padding: '4px 10px', borderRadius: 6, letterSpacing: '0.04em',
        }}>{tag}</span>
        <h3 style={{ margin: 0, fontSize: 20 }}>{title}</h3>
      </div>
      <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14.5 }}>{sub}</p>
    </div>
  );
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div style={{ marginTop: 18 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 18, paddingBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 18, background: '#fff', color: s.accent === 'plain' ? '#334155' : ACCENT[s.accent],
              border: `2px solid ${ACCENT[s.accent]}`, flex: 'none',
            }}>{s.n}</div>
            {i < steps.length - 1 && <div style={{ flex: '1 1 auto', width: 2, background: '#e2e8f0', marginTop: 4 }} />}
          </div>
          <div style={card}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{s.title}</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14.5 }}>{s.desc}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
              {s.chips.map((c) => <span key={c.label} style={chipStyle(c.kind)}>{c.label}</span>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const eyebrow = {
  margin: 0, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.16em',
  textTransform: 'uppercase' as const, color: '#d42f2f',
};
const card = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px',
  boxShadow: 'var(--shadow-sm)',
};
const tocLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600,
  color: '#475569', textDecoration: 'none', padding: '6px 11px', borderRadius: 8,
  background: '#f8fafc', border: '1px solid var(--border)',
};

function chipStyle(kind?: 'who' | 'rec' | 'gate') {
  const base = {
    fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: '3px 9px', borderRadius: 20,
    border: '1px solid #e2e8f0', color: '#64748b', background: '#f8fafc',
  };
  if (kind === 'who') return { ...base, color: '#2563a8', background: '#dde8f4', borderColor: '#c3d5ec' };
  if (kind === 'rec') return { ...base, color: '#1c8f4d', background: '#dcefe1', borderColor: '#bfe3ca' };
  if (kind === 'gate') return { ...base, color: '#d42f2f', background: '#f7e2e0', borderColor: '#f0c9c6' };
  return base;
}
