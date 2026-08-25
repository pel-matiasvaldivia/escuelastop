/**
 * Base de conocimiento de la Escuela de Manejo STOP.
 *
 * Fuente: información oficial provista por la escuela (cursos, turnos, precios y
 * proceso de reserva). Mantener actualizado este archivo cuando cambien precios,
 * turnos o formas de pago. Este texto se inyecta como contexto del agente en cada
 * conversación.
 *
 * PENDIENTE DE CONFIRMAR: direcciones exactas y horarios de cada sucursal,
 * cursos/turnos de sucursales distintas a Guaymallén.
 */
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
(Confirmar direcciones exactas. Los turnos pueden variar según la sucursal.)

# ====================== CURSOS ======================

## 1) Curso PARTICULAR — Principiantes (Licencia B1 autos)
- Precio: $450.000 (el precio del curso es EN EFECTIVO). Para pago con
  transferencia o tarjeta, consultar disponibilidad e intereses.
- Contenido:
  - 4 clases teóricas de aprox. 1.30 hs cada una.
  - Material de estudio: Ley de tránsito, señales viales a color, block de
    notas y lapicera.
  - 11 prácticas en el coche escuela de aprox. 45 min c/u (por lo general 7 de
    conducción en la vía pública y 4 de estacionamiento). Vehículos identificados
    como COCHE ESCUELA y con doble comando.
- Cursado: Teoría 2 clases por semana (presencial). Práctica 3 clases por semana.
  Los días varían según la sucursal.
- Duración total: aprox. 5 a 6 semanas.
- Al finalizar, la persona puede rendir en la Municipalidad en su propio auto o
  con acompañamiento de la escuela (consultar el valor del alquiler del auto para
  rendir según el departamento).
- IMPORTANTE: la categoría B1 de autos se rinde teoría y práctica en la
  Municipalidad que corresponde según el DNI. LA ESCUELA NO ENTREGA LA LICENCIA
  B1; el carnet lo entrega el municipio donde se rinde (el plástico se paga a ellos).
- Forma de pago (dentro del tiempo que dura el curso):
  - 1ra cuota para empezar: $250.000
  - 2da cuota (aprox. 3 semanas después): $100.000
  - 3ra cuota (aprox. 1 semana después): $100.000

## 2) Curso TEORÍA PROFESIONAL — RENOVACIÓN (Sucursal Guaymallén)
Elegir SOLO UNO de los siguientes cursos:
- Curso 1 — Turno Mañana: Lunes de 9:00 a 14:00 hs.
- Curso 2 — Turno Tarde: Lunes de 15:00 a 20:00 hs.
- Curso 3 — Turno Mañana: Miércoles de 9:00 a 14:00 hs.
- Curso 4 — Turno Tarde: Miércoles de 15:00 a 20:00 hs.

## 3) Curso TEORÍA PROFESIONAL — AMPLIACIÓN (Sucursal Guaymallén)
Elegir SOLO UN curso:
- Curso 1 — Turno Mañana: Lunes y Martes de 9:00 a 14:00 hs.
- Curso 2 — Turno Tarde: Lunes y Martes de 15:00 a 20:00 hs.
- Curso 3 — Turno Mañana: Miércoles y Jueves de 9:00 a 14:00 hs.

# ================ CÓMO HACER LA RESERVA ================
(Aplica a los cursos de Teoría Profesional)
Necesitamos:
1. Foto de la licencia de conducir (solo de frente).
2. Correo electrónico y teléfono.
3. Elegir un solo curso del esquema.
4. Pagar el curso.

Formas de pago de la reserva:
- Efectivo: señar el curso con $50.000 para reservar (la seña se hace por
  transferencia) y el resto se paga en la sucursal.
- Transferencia: se puede pagar completo.
  - Alias: escuelastop.mp
  - Titular: Federico Jose Palma
`.trim();
