import { query } from '../db/index.js';

/**
 * Servicio de CAJA (flujo de caja por sucursal).
 *
 * Modelo:
 *  - `caja_sesiones`: una apertura de caja (con saldo inicial en efectivo) que
 *    luego se cierra contando el efectivo final (arqueo).
 *  - `caja_movimientos`: ingresos/egresos, cada uno con el medio por el que
 *    entró/salió el dinero (efectivo, Mercado Pago, Pago Fácil, Rapipago, etc.).
 *
 * Scoping: el operador solo ve/gestiona la caja de SU sucursal; el admin ve
 * todas (sucursal === undefined). Los montos vienen de Postgres como NUMERIC
 * (string); se normalizan a number acá.
 */

export type CajaTipo = 'ingreso' | 'egreso';
export type CajaMedio =
  | 'efectivo' | 'mercadopago' | 'pagofacil' | 'rapipago'
  | 'transferencia' | 'tarjeta' | 'otro';

export const CAJA_MEDIOS: CajaMedio[] = [
  'efectivo', 'mercadopago', 'pagofacil', 'rapipago', 'transferencia', 'tarjeta', 'otro',
];

export interface CajaSesion {
  id: string;
  sede: string | null;
  estado: 'abierta' | 'cerrada';
  saldo_inicial: number;
  saldo_final: number | null;
  abierta_por: string;
  abierta_at: string;
  cerrada_por: string | null;
  cerrada_at: string | null;
  notas: string | null;
}

export interface CajaMovimiento {
  id: string;
  sesion_id: string | null;
  sede: string | null;
  tipo: CajaTipo;
  medio: CajaMedio;
  monto: number;
  concepto: string;
  enrollment_id: string | null;
  registrado_por: string;
  created_at: string;
}

/** Convierte los campos NUMERIC (string) de una sesión a number. */
function mapSesion(r: Record<string, unknown>): CajaSesion {
  return {
    ...(r as unknown as CajaSesion),
    saldo_inicial: Number(r.saldo_inicial ?? 0),
    saldo_final: r.saldo_final == null ? null : Number(r.saldo_final),
  };
}

function mapMovimiento(r: Record<string, unknown>): CajaMovimiento {
  return { ...(r as unknown as CajaMovimiento), monto: Number(r.monto ?? 0) };
}

/** Condición WHERE para el scoping por sucursal (operador). */
function scopeClause(sucursal: string | undefined | null, values: unknown[], col = 'sede'): string {
  if (sucursal === undefined || sucursal === null) return '';
  values.push(sucursal);
  return `${col} = $${values.length}`;
}

/** Sesión de caja ABIERTA para el scope (o null si no hay ninguna). */
export async function getOpenSession(sucursal: string | undefined | null): Promise<CajaSesion | null> {
  const values: unknown[] = [];
  const scope = scopeClause(sucursal, values);
  const where = scope ? `AND ${scope}` : '';
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM caja_sesiones WHERE estado = 'abierta' ${where}
      ORDER BY abierta_at DESC LIMIT 1`,
    values,
  );
  return res.rows[0] ? mapSesion(res.rows[0]) : null;
}

export async function getSessionById(id: string): Promise<CajaSesion | null> {
  const res = await query<Record<string, unknown>>('SELECT * FROM caja_sesiones WHERE id = $1', [id]);
  return res.rows[0] ? mapSesion(res.rows[0]) : null;
}

/**
 * Abre una caja. Falla si ya hay una abierta para esa sucursal (no se pueden
 * tener dos cajas abiertas en la misma sede a la vez).
 */
export async function openSession(opts: {
  sede: string | null; saldoInicial: number; usuario: string; notas?: string | null;
}): Promise<{ sesion: CajaSesion } | { error: string }> {
  const abierta = await getOpenSession(opts.sede ?? undefined);
  if (abierta && (abierta.sede ?? null) === (opts.sede ?? null)) {
    return { error: 'Ya hay una caja abierta para esta sucursal. Cerrala antes de abrir otra.' };
  }
  const res = await query<Record<string, unknown>>(
    `INSERT INTO caja_sesiones (sede, saldo_inicial, abierta_por, notas)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [opts.sede, opts.saldoInicial, opts.usuario, opts.notas ?? null],
  );
  return { sesion: mapSesion(res.rows[0]) };
}

/** Cierra una caja con el arqueo de efectivo. Idempotente si ya está cerrada. */
export async function closeSession(opts: {
  id: string; saldoFinal: number; usuario: string; notas?: string | null;
}): Promise<CajaSesion | null> {
  const res = await query<Record<string, unknown>>(
    `UPDATE caja_sesiones
        SET estado = 'cerrada', saldo_final = $2, cerrada_por = $3, cerrada_at = now(),
            notas = COALESCE($4, notas)
      WHERE id = $1 AND estado = 'abierta' RETURNING *`,
    [opts.id, opts.saldoFinal, opts.usuario, opts.notas ?? null],
  );
  if (res.rows[0]) return mapSesion(res.rows[0]);
  // Ya estaba cerrada (o no existe): devolvemos el estado actual si existe.
  return getSessionById(opts.id);
}

/** Historial de sesiones (con totales de ingresos/egresos por sesión). */
export async function listSessions(
  sucursal: string | undefined | null, limit = 30,
): Promise<(CajaSesion & { ingresos: number; egresos: number })[]> {
  const values: unknown[] = [];
  const scope = scopeClause(sucursal, values, 's.sede');
  const where = scope ? `WHERE ${scope}` : '';
  values.push(Math.min(Math.max(limit, 1), 200));
  const res = await query<Record<string, unknown>>(
    `SELECT s.*,
            COALESCE((SELECT SUM(monto) FROM caja_movimientos m
                       WHERE m.sesion_id = s.id AND m.tipo = 'ingreso'), 0) AS ingresos,
            COALESCE((SELECT SUM(monto) FROM caja_movimientos m
                       WHERE m.sesion_id = s.id AND m.tipo = 'egreso'), 0) AS egresos
       FROM caja_sesiones s
       ${where}
      ORDER BY s.abierta_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return res.rows.map((r) => ({
    ...mapSesion(r),
    ingresos: Number(r.ingresos ?? 0),
    egresos: Number(r.egresos ?? 0),
  }));
}

/** Registra un movimiento de ingreso/egreso. */
export async function addMovimiento(opts: {
  sesionId: string | null; sede: string | null; tipo: CajaTipo; medio: CajaMedio;
  monto: number; concepto: string; usuario: string; enrollmentId?: string | null;
}): Promise<CajaMovimiento> {
  const res = await query<Record<string, unknown>>(
    `INSERT INTO caja_movimientos
       (sesion_id, sede, tipo, medio, monto, concepto, enrollment_id, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [opts.sesionId, opts.sede, opts.tipo, opts.medio, opts.monto,
      opts.concepto, opts.enrollmentId ?? null, opts.usuario],
  );
  return mapMovimiento(res.rows[0]);
}

export interface MovimientoListOpts {
  sucursal?: string | null;
  tipo?: CajaTipo;
  medio?: CajaMedio;
  sesionId?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

/** Lista movimientos con filtros y paginación (COUNT(*) OVER() para el total). */
export async function listMovimientos(
  opts: MovimientoListOpts = {},
): Promise<{ rows: CajaMovimiento[]; total: number }> {
  const conds: string[] = [];
  const values: unknown[] = [];
  const scope = scopeClause(opts.sucursal, values);
  if (scope) conds.push(scope);
  if (opts.tipo) { values.push(opts.tipo); conds.push(`tipo = $${values.length}`); }
  if (opts.medio) { values.push(opts.medio); conds.push(`medio = $${values.length}`); }
  if (opts.sesionId) { values.push(opts.sesionId); conds.push(`sesion_id = $${values.length}`); }
  if (opts.desde) { values.push(opts.desde); conds.push(`created_at >= $${values.length}::date`); }
  if (opts.hasta) {
    values.push(opts.hasta);
    conds.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  values.push(limit); const limIdx = values.length;
  values.push(offset); const offIdx = values.length;

  const res = await query<Record<string, unknown>>(
    `SELECT *, COUNT(*) OVER() AS total_count
       FROM caja_movimientos
       ${where}
      ORDER BY created_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    values,
  );
  const total = res.rows[0] ? Number(res.rows[0].total_count) : 0;
  return { rows: res.rows.map(mapMovimiento), total };
}

export interface CajaResumen {
  ingresos: number;
  egresos: number;
  neto: number;
  /** Desglose por medio de pago (ingresos, egresos y neto). */
  porMedio: { medio: CajaMedio; ingresos: number; egresos: number; neto: number; cantidad: number }[];
}

/**
 * Resumen del flujo de caja en un rango (o de una sesión concreta): totales de
 * ingresos/egresos, neto y el desglose por medio de pago.
 */
export async function cajaResumen(opts: {
  sucursal?: string | null; desde?: string; hasta?: string; sesionId?: string;
}): Promise<CajaResumen> {
  const conds: string[] = [];
  const values: unknown[] = [];
  const scope = scopeClause(opts.sucursal, values);
  if (scope) conds.push(scope);
  if (opts.sesionId) { values.push(opts.sesionId); conds.push(`sesion_id = $${values.length}`); }
  if (opts.desde) { values.push(opts.desde); conds.push(`created_at >= $${values.length}::date`); }
  if (opts.hasta) {
    values.push(opts.hasta);
    conds.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const res = await query<Record<string, unknown>>(
    `SELECT medio,
            COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
            COALESCE(SUM(monto) FILTER (WHERE tipo = 'egreso'), 0)  AS egresos,
            COUNT(*) AS cantidad
       FROM caja_movimientos
       ${where}
      GROUP BY medio`,
    values,
  );

  let ingresos = 0;
  let egresos = 0;
  const porMedio = res.rows.map((r) => {
    const ing = Number(r.ingresos ?? 0);
    const egr = Number(r.egresos ?? 0);
    ingresos += ing;
    egresos += egr;
    return {
      medio: r.medio as CajaMedio,
      ingresos: ing,
      egresos: egr,
      neto: ing - egr,
      cantidad: Number(r.cantidad ?? 0),
    };
  });
  // Orden estable por el orden canónico de medios.
  porMedio.sort((a, b) => CAJA_MEDIOS.indexOf(a.medio) - CAJA_MEDIOS.indexOf(b.medio));

  return { ingresos, egresos, neto: ingresos - egresos, porMedio };
}
