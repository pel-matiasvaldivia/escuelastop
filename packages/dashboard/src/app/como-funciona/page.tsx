'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../lib/api';

/**
 * Página informativa "Cómo funciona": el recorrido del alumno de punta a punta,
 * del primer WhatsApp hasta la licencia. Material de referencia para el equipo
 * (y para presentarle el proceso al dueño). No consume datos.
 */

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
    desc: 'El alumno paga la seña por Mercado Pago. Recién con la seña aprobada se habilita elegir sucursal y turno. Una inscripción “en firme” es siempre una que ya pagó.',
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
    n: 7, accent: 'plain', title: 'Comisión y matrícula',
    desc: 'El instructor (o el admin) abre una comisión — curso, sucursal y la plantilla de examen de la categoría — y matricula a los alumnos. Cada alumno recibe un código único para rendir.',
    chips: [{ label: 'Instructor', kind: 'who' }, { label: 'Código por alumno' }],
  },
  {
    n: 8, accent: 'plain', title: 'Capacitación',
    desc: 'Clases teóricas presenciales y prácticas en el coche escuela o en el vehículo de la categoría (auto, camión, micro, maquinaria). El material y las prácticas dependen del curso.',
    chips: [{ label: 'Instructor + Alumno', kind: 'who' }],
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

interface Route {
  c: 'b1' | 'prof' | 'reno';
  title: string;
  sub: string;
  items: string[];
  where: string;
}

const ROUTES: Route[] = [
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
const ROUTE_COLOR: Record<Route['c'], string> = { b1: '#2563a8', prof: '#b9740f', reno: '#1c8f4d' };

export default function ComoFuncionaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 860 }}>
      <p style={eyebrow}>Recorrido del alumno</p>
      <h1 style={{ margin: '0 0 6px', fontSize: 30, letterSpacing: '-0.01em' }}>
        Del primer WhatsApp a la licencia
      </h1>
      <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 16, maxWidth: '62ch' }}>
        Cómo funciona la plataforma de punta a punta: el agente atiende la consulta, gestiona la
        inscripción y el pago, y después acompaña la capacitación, la evaluación y la certificación
        — todo registrado en un solo lugar.
      </p>

      <Phase tag="FASE 1" title="De la consulta a la inscripción"
        sub="El agente de IA responde solo, sin perder ningún mensaje, y no deja avanzar hasta que están los datos y la seña." />
      <Timeline steps={FASE1} />

      <Phase tag="FASE 2" title="De la capacitación a la licencia"
        sub="El instructor arma el curso, toma la evaluación y cierra la formación con un certificado verificable." />
      <Timeline steps={FASE2} />

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

function Phase({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#fff', background: '#16202f',
          padding: '4px 10px', borderRadius: 6, letterSpacing: '0.04em',
        }}>{tag}</span>
        <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
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
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(20,30,45,.05)',
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
