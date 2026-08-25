import { COURSES, type Course } from './catalog.js';

/**
 * Base de conocimiento de la Escuela de Manejo STOP.
 *
 * Se GENERA a partir del catálogo estructurado (catalog.ts) para que el agente,
 * el formulario y el dashboard usen siempre los mismos datos. Editar catalog.ts,
 * no este archivo.
 */

const money = (n: number) => `$${n.toLocaleString('es-AR')}`;

function courseToText(c: Course): string {
  const lines: string[] = [`## ${c.name}`];
  if (c.description) lines.push(c.description);
  if (c.price !== null) lines.push(`Precio: ${money(c.price)}.${c.priceNote ? ' ' + c.priceNote : ''}`);
  else if (c.priceNote) lines.push(`Precio: ${c.priceNote}`);

  if (c.includes?.length) {
    lines.push('Incluye:');
    c.includes.forEach((i) => lines.push(`- ${i}`));
  }
  if (c.schedules?.length) {
    lines.push('Turnos disponibles (elegir uno):');
    c.schedules.forEach((s) =>
      lines.push(`- ${s.sucursal} · Turno ${s.turno} · ${s.dias} · ${s.horario}`),
    );
  }
  if (c.paymentPlan?.length) {
    lines.push('Forma de pago (durante el curso):');
    c.paymentPlan.forEach((p) => lines.push(`- ${p.label}: ${money(p.amount)}`));
  }
  if (c.reserva) {
    lines.push('Reserva:');
    if (c.reserva.instrucciones) lines.push(`- ${c.reserva.instrucciones}`);
    if (c.reserva.alias) lines.push(`- Alias: ${c.reserva.alias} (a nombre de ${c.reserva.titular}).`);
  }
  if (c.contactSucursal) {
    lines.push('Para contratar esta modalidad hay que comunicarse con la sucursal.');
  }
  if (c.requiredDocs?.length) {
    lines.push(`Documentación requerida: ${c.requiredDocs.join('; ')}.`);
  }
  if (c.notes?.length) {
    lines.push('Importante:');
    c.notes.forEach((n) => lines.push(`- ${n}`));
  }
  return lines.join('\n');
}

export const KNOWLEDGE_BASE = `
# Escuela de Manejo STOP — Información oficial

## Sobre nosotros
Escuela de conductores con más de 15 años de experiencia en Mendoza. Formamos
conductores para licencias particulares y profesionales, con instructores full-time
y atención personalizada.

## Contacto
- Teléfono / WhatsApp: +54 261 387-2184
- Email: escuelastop@gmail.com

## Sucursales
- Sucursal Guaymallén.
- Sucursal Las Heras.
(Los turnos pueden variar según la sucursal. Confirmar direcciones exactas.)

# ====================== CURSOS ======================

${COURSES.map(courseToText).join('\n\n')}
`.trim();
