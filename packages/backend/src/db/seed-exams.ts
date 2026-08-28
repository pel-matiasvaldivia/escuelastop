import 'dotenv/config';
import { pool } from './index.js';
import { upsertBank, listQuestions, addQuestion } from '../services/exams.js';

/**
 * Siembra un banco de examen de EJEMPLO (categoría B1) para probar el flujo de
 * la Fase 2 punta a punta. Las preguntas reales las carga la escuela; esto solo
 * deja el sistema demostrable.
 *
 * Uso:
 *   npm run seed:exams --workspace @escuelastop/backend
 *
 * Idempotente: no duplica preguntas si el banco ya las tiene.
 */

const B1_PREGUNTAS: { enunciado: string; opciones: string[]; correcta: number }[] = [
  {
    enunciado: '¿Qué indica una línea amarilla continua en el centro de la calzada?',
    opciones: [
      'Se puede adelantar con precaución',
      'Prohibido cruzarla o adelantar',
      'Zona de estacionamiento permitido',
      'Carril exclusivo para colectivos',
    ],
    correcta: 1,
  },
  {
    enunciado: 'Ante un semáforo en amarillo intermitente, se debe:',
    opciones: [
      'Frenar por completo siempre',
      'Acelerar para cruzar rápido',
      'Reducir la velocidad y avanzar con precaución',
      'Tocar bocina y continuar',
    ],
    correcta: 2,
  },
  {
    enunciado: 'La velocidad máxima en una calle urbana, salvo señalización, es de:',
    opciones: ['40 km/h', '60 km/h', '80 km/h', '110 km/h'],
    correcta: 0,
  },
  {
    enunciado: '¿Quién tiene prioridad de paso en una encrucijada sin señalizar?',
    opciones: [
      'El que viene por la izquierda',
      'El que viene por la derecha',
      'El vehículo más grande',
      'El que llega más rápido',
    ],
    correcta: 1,
  },
  {
    enunciado: 'El uso del cinturón de seguridad es obligatorio para:',
    opciones: [
      'Solo el conductor',
      'Solo los asientos delanteros',
      'Todos los ocupantes del vehículo',
      'Solo en autopista',
    ],
    correcta: 2,
  },
  {
    enunciado: 'La tasa de alcoholemia permitida para conducir un auto particular es:',
    opciones: ['0,5 g/l', '0,8 g/l', '0 g/l en la mayoría de las jurisdicciones', '1,0 g/l'],
    correcta: 2,
  },
  {
    enunciado: 'Antes de girar, el conductor debe:',
    opciones: [
      'Tocar bocina',
      'Señalizar con la luz de giro con anticipación',
      'Encender las balizas',
      'Acelerar',
    ],
    correcta: 1,
  },
  {
    enunciado: 'Una señal triangular con borde rojo indica:',
    opciones: ['Prohibición', 'Información', 'Advertencia / peligro', 'Servicio'],
    correcta: 2,
  },
  {
    enunciado: 'La distancia de seguimiento con el vehículo de adelante debe:',
    opciones: [
      'Ser la mínima posible',
      'Aumentar cuando llueve o hay poca visibilidad',
      'Ser siempre de un metro',
      'No importa si vas despacio',
    ],
    correcta: 1,
  },
  {
    enunciado: 'Al aproximarse a una senda peatonal con peatones cruzando, se debe:',
    opciones: [
      'Tener prioridad el vehículo',
      'Detenerse y ceder el paso al peatón',
      'Tocar bocina para que se apuren',
      'Esquivarlos sin frenar',
    ],
    correcta: 1,
  },
];

async function main() {
  const bank = await upsertBank({
    categoria: 'B1',
    nombre: 'B1 — Particular (autos) — Banco de ejemplo',
    descripcion: 'Banco de demostración para probar el flujo de examen. Reemplazar por el contenido real.',
    preguntas_por_examen: 10,
    nota_minima: 70,
    tiempo_limite_min: 30,
    intentos_max: 2,
  });

  const existentes = await listQuestions(bank.id);
  if (existentes.length > 0) {
    console.log(`ℹ️  El banco B1 ya tiene ${existentes.length} preguntas; no se agregan duplicados.`);
    await pool.end();
    return;
  }

  let orden = 0;
  for (const p of B1_PREGUNTAS) {
    await addQuestion({ bankId: bank.id, enunciado: p.enunciado, opciones: p.opciones, correcta: p.correcta, orden: orden++ });
  }
  console.log(`✅ Banco B1 sembrado con ${B1_PREGUNTAS.length} preguntas de ejemplo.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error sembrando el banco de examen:', err);
  process.exit(1);
});
