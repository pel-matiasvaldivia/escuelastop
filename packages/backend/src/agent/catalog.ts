/**
 * Catálogo estructurado de cursos de la Escuela de Manejo STOP.
 *
 * ÚNICA FUENTE DE VERDAD. Alimenta:
 *  - el agente (se convierte a texto en knowledge.ts),
 *  - el formulario de inscripción dinámico (campos y docs según el curso),
 *  - el dashboard (listados y filtros).
 *
 * Mantener actualizado cuando cambien precios, turnos o modalidades.
 * Fuente: información oficial provista por la escuela.
 */

export type Sucursal = 'Guaymallén' | 'Las Heras';

/** Campos que el formulario puede pedir. El curso declara cuáles necesita. */
export type FormFieldKey =
  | 'nombre'
  | 'dni'
  | 'edad'
  | 'email'
  | 'telefono'
  | 'sucursal'
  | 'turno'          // selección de un turno/curso concreto (schedules)
  | 'foto_licencia'  // adjunto: foto de la licencia de frente
  | 'foto_dni'       // adjunto: foto del DNI
  | 'apto_medico';   // adjunto: certificado / apto médico

export interface Schedule {
  id: string;
  sucursal: Sucursal;
  turno: 'Mañana' | 'Tarde';
  dias: string;      // "Lunes", "Lunes y Martes", etc.
  horario: string;   // "09:00 a 14:00 hs"
}

export interface PaymentInstallment {
  label: string;
  amount: number;
}

export interface Course {
  id: string;
  name: string;
  category:
    | 'particular'
    | 'profesional_renovacion'
    | 'profesional_ampliacion'
    | 'practicas'
    | 'avanzado'
    | 'teoria_sola'
    | 'alquiler_auto';
  /** Precio de referencia en ARS. null = "consultar". */
  price: number | null;
  priceNote?: string;
  /**
   * Monto de la seña (ARS) que debe pagarse para RESERVAR, ANTES de habilitar la
   * elección de sucursal y turno. null = no se cobra seña online (se coordina con
   * la sucursal).
   */
  seniaReserva?: number | null;
  description?: string;
  /** Contenido / qué incluye. */
  includes?: string[];
  /** Plan de cuotas (curso particular). */
  paymentPlan?: PaymentInstallment[];
  /** Datos de la seña/reserva, si aplica. */
  reserva?: {
    montoSenia?: number;
    alias?: string;
    titular?: string;
    instrucciones?: string;
  };
  /** Turnos disponibles (para cursos con esquema fijo de horarios). */
  schedules?: Schedule[];
  /** Campos que debe mostrar el formulario de inscripción para este curso. */
  requiredFields: FormFieldKey[];
  /** Documentos a adjuntar. */
  requiredDocs?: string[];
  /** Notas / aclaraciones importantes. */
  notes?: string[];
  /** true = la reserva/contratación se hace comunicándose con la sucursal. */
  contactSucursal?: boolean;
}

const RESERVA_PROFESIONAL = {
  montoSenia: 50000,
  alias: 'escuelastop.mp',
  titular: 'Federico Jose Palma',
  instrucciones:
    'Efectivo: señar el curso con $50.000 por transferencia para reservar y el ' +
    'resto se paga en la sucursal. Transferencia: se puede pagar completo al alias.',
};

export const COURSES: Course[] = [
  // ------------------------------------------------------------------ Particular
  {
    id: 'particular-b1',
    name: 'Curso Particular — Principiantes (Licencia B1 autos)',
    category: 'particular',
    price: 450000,
    priceNote:
      'El precio es en EFECTIVO. Para transferencia o tarjeta, consultar ' +
      'disponibilidad e intereses.',
    seniaReserva: 50000, // CONFIRMAR monto de seña para reservar el curso particular
    description:
      'Curso para principiantes de licencia particular B1 (autos). Duración ' +
      'aprox. 5 a 6 semanas.',
    includes: [
      '4 clases teóricas de aprox. 1:30 hs cada una',
      'Material de estudio: Ley de tránsito, señales viales a color, block de notas y lapicera',
      '11 prácticas en coche escuela de aprox. 45 min c/u (7 de conducción en vía pública y 4 de estacionamiento)',
      'Vehículos identificados como COCHE ESCUELA con doble comando',
      'Teoría: 2 clases por semana (presencial). Práctica: 3 clases por semana',
    ],
    paymentPlan: [
      { label: '1ra cuota (para empezar)', amount: 250000 },
      { label: '2da cuota (aprox. 3 semanas después)', amount: 100000 },
      { label: '3ra cuota (aprox. 1 semana después)', amount: 100000 },
    ],
    requiredFields: ['nombre', 'dni', 'edad', 'email', 'telefono', 'sucursal'],
    requiredDocs: ['Foto del DNI'],
    notes: [
      'La categoría B1 de autos se rinde teoría y práctica en la Municipalidad que corresponde según el DNI.',
      'LA ESCUELA NO ENTREGA LA LICENCIA B1: el carnet lo entrega el municipio donde se rinde (el plástico se paga a ellos).',
      'Al finalizar se puede rendir en auto propio o con acompañamiento de la escuela (consultar valor del alquiler del auto para rendir según el departamento).',
      'Los días de cursado varían según la sucursal.',
    ],
  },

  // ------------------------------------------------ Profesional — Renovación
  {
    id: 'profesional-renovacion',
    name: 'Teoría Profesional — Renovación',
    category: 'profesional_renovacion',
    price: null,
    priceNote: 'Consultar valor.',
    description: 'Curso teórico profesional para renovación. Elegir un solo turno.',
    schedules: [
      { id: 'reno-1', sucursal: 'Guaymallén', turno: 'Mañana', dias: 'Lunes', horario: '09:00 a 14:00 hs' },
      { id: 'reno-2', sucursal: 'Guaymallén', turno: 'Tarde', dias: 'Lunes', horario: '15:00 a 20:00 hs' },
      { id: 'reno-3', sucursal: 'Guaymallén', turno: 'Mañana', dias: 'Miércoles', horario: '09:00 a 14:00 hs' },
      { id: 'reno-4', sucursal: 'Guaymallén', turno: 'Tarde', dias: 'Miércoles', horario: '15:00 a 20:00 hs' },
    ],
    reserva: RESERVA_PROFESIONAL,
    seniaReserva: 50000,
    requiredFields: ['nombre', 'email', 'telefono', 'sucursal', 'turno', 'foto_licencia'],
    requiredDocs: ['Foto de la licencia de conducir (solo de frente)'],
    notes: ['Elegir un solo curso/turno del esquema.'],
  },

  // ------------------------------------------------ Profesional — Ampliación
  {
    id: 'profesional-ampliacion',
    name: 'Teoría Profesional — Ampliación',
    category: 'profesional_ampliacion',
    price: null,
    priceNote: 'Consultar valor.',
    description: 'Curso teórico profesional para ampliación. Elegir un solo turno.',
    schedules: [
      { id: 'amp-1', sucursal: 'Guaymallén', turno: 'Mañana', dias: 'Lunes y Martes', horario: '09:00 a 14:00 hs' },
      { id: 'amp-2', sucursal: 'Guaymallén', turno: 'Tarde', dias: 'Lunes y Martes', horario: '15:00 a 20:00 hs' },
      { id: 'amp-3', sucursal: 'Guaymallén', turno: 'Mañana', dias: 'Miércoles y Jueves', horario: '09:00 a 14:00 hs' },
    ],
    reserva: RESERVA_PROFESIONAL,
    seniaReserva: 50000,
    requiredFields: ['nombre', 'email', 'telefono', 'sucursal', 'turno', 'foto_licencia'],
    requiredDocs: ['Foto de la licencia de conducir (solo de frente)'],
    notes: ['Elegir un solo curso/turno del esquema.'],
  },

  // ------------------------------------------------------- Solo Prácticas AUTO
  {
    id: 'practicas-auto',
    name: 'Solo Prácticas — Auto',
    category: 'practicas',
    price: 43000,
    priceNote:
      'Precio por clase (45 min). El precio es en EFECTIVO; para transferencia o ' +
      'tarjeta consultar disponibilidad e intereses.',
    description:
      'Clases de práctica sueltas. Se pueden comprar de a una o por promo. ' +
      'Se toman 3 clases de manejo por semana.',
    includes: [
      '1 clase suelta: $43.000',
      'Promo x 5 clases: $193.500',
      'Promo x 10 clases (pagás 9): $387.000',
      'Cada práctica dura 45 minutos',
    ],
    requiredFields: ['nombre', 'telefono', 'sucursal'],
    contactSucursal: true,
    notes: [
      'Para contratar prácticas solas hay que comunicarse con la sucursal donde se harían las clases, pagar el total de clases y ahí se programan.',
    ],
  },

  // ------------------------------------------------------------- Curso Avanzado
  {
    id: 'avanzado',
    name: 'Curso Avanzado',
    category: 'avanzado',
    price: null,
    priceNote: 'Consultar valor y disponibilidad.',
    description: 'Curso avanzado. (Detalle a confirmar con la escuela.)',
    requiredFields: ['nombre', 'telefono', 'sucursal'],
    contactSucursal: true,
    notes: ['CONFIRMAR: contenido, duración y precio del curso avanzado.'],
  },

  // ---------------------------------------------------------------- Teoría sola
  {
    id: 'teoria-sola',
    name: 'Teoría sola',
    category: 'teoria_sola',
    price: null,
    priceNote: 'Consultar valor y disponibilidad.',
    description: 'Cursado solo de la parte teórica. (Detalle a confirmar.)',
    requiredFields: ['nombre', 'telefono', 'sucursal'],
    contactSucursal: true,
    notes: ['CONFIRMAR: turnos, duración y precio de la teoría sola.'],
  },

  // ------------------------------------------------ Alquiler del auto para rendir
  {
    id: 'alquiler-auto',
    name: 'Alquiler del auto para rendir la licencia',
    category: 'alquiler_auto',
    price: null,
    priceNote: 'Consultar valor según el departamento.',
    description:
      'Alquiler del auto para rendir la licencia de conducir. Es un combo: un día ' +
      'de clases + el auto. No se alquila el vehículo solo.',
    requiredFields: ['nombre', 'telefono', 'sucursal'],
    contactSucursal: true,
    notes: [
      'Se alquila el combo completo (día de clases + auto); no puede ser el vehículo solo.',
    ],
  },
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
