'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  CAJA_MEDIO_LABEL, CAJA_MEDIOS,
  type CajaSesion, type CajaResumen, type CajaMovimiento, type CajaMedio, type CajaTipo,
} from '../../lib/api';

const PAGE_SIZE = 25;

/** Formato de moneda ARS. */
function ars(n: number): string {
  return `$${(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Caja: flujo de caja por sucursal. Apertura/cierre, registro de ingresos y
 * egresos por medio de pago, reporte por medio y listado de movimientos con
 * filtros y paginación.
 */
export default function CajaPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<CajaSesion | null>(null);
  const [sesResumen, setSesResumen] = useState<CajaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Movimientos + filtros.
  const [rows, setRows] = useState<CajaMovimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [reporte, setReporte] = useState<CajaResumen | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [fTipo, setFTipo] = useState<'' | CajaTipo>('');
  const [fMedio, setFMedio] = useState<'' | CajaMedio>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);

  function flash(msg: string) { setNotice(msg); setError(null); setTimeout(() => setNotice(null), 3500); }

  const loadSession = useCallback(async () => {
    const { sesion: s, resumen } = await api.cajaSession();
    setSesion(s);
    setSesResumen(resumen);
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated()) { router.replace('/login'); return; }
    (async () => {
      try {
        await loadSession();
      } catch (err) {
        if (err instanceof UnauthorizedError) { router.replace('/login'); return; }
        setError('No se pudo cargar la caja. ¿Está corriendo el backend?');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(1); }, [fTipo, fMedio, desde, hasta]);

  // Movimientos + reporte por medio (según filtros).
  const loadMovimientos = useCallback(async () => {
    setListLoading(true);
    try {
      const [mov, rep] = await Promise.all([
        api.cajaMovimientos({
          tipo: fTipo || undefined, medio: fMedio || undefined,
          desde, hasta, page, pageSize: PAGE_SIZE,
        }),
        api.cajaResumen({ desde, hasta }),
      ]);
      setRows(mov.rows); setTotal(mov.total); setReporte(rep);
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) setError('No se pudieron cargar los movimientos.');
    } finally {
      setListLoading(false);
    }
  }, [fTipo, fMedio, desde, hasta, page]);

  useEffect(() => {
    if (!auth.isAuthenticated()) return;
    void loadMovimientos();
  }, [loadMovimientos]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hayFiltros = !!(fTipo || fMedio || desde || hasta);

  if (loading) return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando caja…</span></div>;
  if (error && !sesion) return <div className="card card-pad" style={dangerCard}>{error}</div>;

  async function afterMutation(msg: string) {
    flash(msg);
    await Promise.all([loadSession(), loadMovimientos()]);
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Panel</div>
          <h1>Caja</h1>
          <div className="sub">Ingresos, egresos, apertura y cierre, y reportes por medio de pago.</div>
        </div>
      </div>

      {notice && <div style={noticeCard}>{notice}</div>}
      {error && <div style={dangerCard}>{error}</div>}

      {/* Estado de la caja */}
      <EstadoCaja
        sesion={sesion}
        resumen={sesResumen}
        onOpened={() => afterMutation('Caja abierta.')}
        onClosed={() => afterMutation('Caja cerrada.')}
        onError={(m) => setError(m)}
      />

      {/* Nuevo movimiento */}
      <NuevoMovimiento
        sesion={sesion}
        onAdded={() => afterMutation('Movimiento registrado.')}
        onError={(m) => setError(m)}
      />

      {/* Reporte por medio de pago */}
      <ReportePorMedio reporte={reporte} rango={{ desde, hasta }} />

      {/* Movimientos */}
      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <h2>Movimientos</h2>
          <span className="badge">{total}</span>
        </div>

        <div style={filterBar}>
          <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as '' | CajaTipo)} style={{ flex: '1 1 150px' }}>
            <option value="">Ingresos y egresos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="egreso">Solo egresos</option>
          </select>
          <select className="select" value={fMedio} onChange={(e) => setFMedio(e.target.value as '' | CajaMedio)} style={{ flex: '1 1 160px' }}>
            <option value="">Todos los medios</option>
            {CAJA_MEDIOS.map((m) => <option key={m} value={m}>{CAJA_MEDIO_LABEL[m]}</option>)}
          </select>
          <label style={dateWrap}>
            <span style={dateLbl}>Desde</span>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label style={dateWrap}>
            <span style={dateLbl}>Hasta</span>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          {hayFiltros && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFTipo(''); setFMedio(''); setDesde(''); setHasta(''); }}>Limpiar</button>
          )}
        </div>

        <div className="table-wrap" style={{ opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Medio</th>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6}><div className="empty">
                  {hayFiltros ? 'No hay movimientos que coincidan con los filtros.' : 'Sin movimientos todavía.'}
                </div></td></tr>
              )}
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <span className={`badge ${m.tipo === 'ingreso' ? 'badge-success' : 'badge-danger'}`}>
                      {m.tipo === 'ingreso' ? '↧ Ingreso' : '↥ Egreso'}
                    </span>
                  </td>
                  <td><span className="badge badge-info">{CAJA_MEDIO_LABEL[m.medio]}</span></td>
                  <td>{m.concepto}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: m.tipo === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{ars(m.monto)}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{m.registrado_por}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={pager}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {total === 0 ? 'Sin resultados' : `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} de ${total}`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" disabled={page <= 1 || listLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Página {page} de {totalPages}</span>
            <button className="btn btn-sm" disabled={page >= totalPages || listLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente →</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- Estado de caja -------------------------------- */

function EstadoCaja({
  sesion, resumen, onOpened, onClosed, onError,
}: {
  sesion: CajaSesion | null; resumen: CajaResumen | null;
  onOpened: () => void; onClosed: () => void; onError: (m: string) => void;
}) {
  const [saldoInicial, setSaldoInicial] = useState('');
  const [saldoFinal, setSaldoFinal] = useState('');
  const [busy, setBusy] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  // Efectivo esperado en caja = saldo inicial + neto de movimientos en efectivo.
  const efectivoMov = useMemo(() => {
    const e = resumen?.porMedio.find((p) => p.medio === 'efectivo');
    return e ? e.neto : 0;
  }, [resumen]);
  const efectivoEsperado = (sesion?.saldo_inicial ?? 0) + efectivoMov;

  async function abrir() {
    const monto = Number(saldoInicial || '0');
    if (!Number.isFinite(monto) || monto < 0) { onError('El saldo inicial debe ser un número válido.'); return; }
    setBusy(true);
    try {
      await api.openCaja({ saldoInicial: monto });
      setSaldoInicial('');
      onOpened();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo abrir la caja');
    } finally { setBusy(false); }
  }

  async function cerrar() {
    if (!sesion) return;
    const monto = Number(saldoFinal || '0');
    if (!Number.isFinite(monto) || monto < 0) { onError('El saldo final debe ser un número válido.'); return; }
    setBusy(true);
    try {
      await api.closeCaja(sesion.id, { saldoFinal: monto });
      setSaldoFinal(''); setCerrando(false);
      onClosed();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    } finally { setBusy(false); }
  }

  if (!sesion) {
    return (
      <section className="card card-pad" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge">Caja cerrada</span>
          <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>No hay una caja abierta. Abrila para empezar a registrar movimientos del día.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ maxWidth: 220 }}>
            <span className="label">Saldo inicial en efectivo</span>
            <input className="input" type="number" min={0} step="0.01" placeholder="0"
              value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={abrir} disabled={busy}>
            {busy ? 'Abriendo…' : '🔓 Abrir caja'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card card-pad" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge badge-success">● Caja abierta</span>
          {sesion.sede && <span className="badge">{sesion.sede}</span>}
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Abierta por {sesion.abierta_por} · {new Date(sesion.abierta_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {!cerrando && (
          <button className="btn btn-dark" onClick={() => setCerrando(true)}>🔒 Cerrar caja</button>
        )}
      </div>

      {/* Tiles de la sesión */}
      <div className="stat-grid">
        <MiniStat label="Saldo inicial" value={ars(sesion.saldo_inicial)} tint="var(--brand-050)" />
        <MiniStat label="Ingresos" value={ars(resumen?.ingresos ?? 0)} tint="var(--success-bg)" color="var(--success)" />
        <MiniStat label="Egresos" value={ars(resumen?.egresos ?? 0)} tint="var(--danger-bg)" color="var(--danger)" />
        <MiniStat label="Efectivo esperado" value={ars(efectivoEsperado)} tint="var(--warning-bg)" hint="Inicial + neto en efectivo" />
      </div>

      {cerrando && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <label className="field" style={{ maxWidth: 240 }}>
            <span className="label">Efectivo contado (arqueo)</span>
            <input className="input" type="number" min={0} step="0.01" placeholder={String(efectivoEsperado)}
              value={saldoFinal} onChange={(e) => setSaldoFinal(e.target.value)} />
            <span className="hint">Esperado: {ars(efectivoEsperado)}</span>
          </label>
          <button className="btn btn-dark" onClick={cerrar} disabled={busy}>{busy ? 'Cerrando…' : 'Confirmar cierre'}</button>
          <button className="btn btn-ghost" onClick={() => setCerrando(false)} disabled={busy}>Cancelar</button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ Nuevo movimiento ------------------------------- */

function NuevoMovimiento({
  sesion, onAdded, onError,
}: { sesion: CajaSesion | null; onAdded: () => void; onError: (m: string) => void }) {
  const [tipo, setTipo] = useState<CajaTipo>('ingreso');
  const [medio, setMedio] = useState<CajaMedio>('efectivo');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [busy, setBusy] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const importe = Number(monto);
    if (!Number.isFinite(importe) || importe <= 0) { onError('El monto debe ser mayor a 0.'); return; }
    if (!concepto.trim()) { onError('Ingresá un concepto.'); return; }
    setBusy(true);
    try {
      await api.addMovimiento({ tipo, medio, monto: importe, concepto: concepto.trim(), sesionId: sesion?.id });
      setMonto(''); setConcepto('');
      onAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
    } finally { setBusy(false); }
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Registrar movimiento</h2></div>
      <form onSubmit={registrar} style={{ padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '0 0 auto' }}>
          <span className="label">Tipo</span>
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as CajaTipo)} style={{ width: 150 }}>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
        </label>
        <label className="field" style={{ flex: '0 0 auto' }}>
          <span className="label">Medio de pago</span>
          <select className="select" value={medio} onChange={(e) => setMedio(e.target.value as CajaMedio)} style={{ width: 170 }}>
            {CAJA_MEDIOS.map((m) => <option key={m} value={m}>{CAJA_MEDIO_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '0 0 auto' }}>
          <span className="label">Monto</span>
          <input className="input" type="number" min={0} step="0.01" placeholder="0" value={monto}
            onChange={(e) => setMonto(e.target.value)} style={{ width: 140 }} />
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>
          <span className="label">Concepto</span>
          <input className="input" placeholder="Ej: Seña curso B1, alquiler, sueldos…" value={concepto}
            onChange={(e) => setConcepto(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : '+ Agregar'}
        </button>
      </form>
      {!sesion && (
        <div style={{ padding: '0 20px 14px' }}>
          <span className="hint">No hay una caja abierta: el movimiento se registra igual, pero no queda asociado a una sesión. Abrí la caja para el arqueo del día.</span>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Reporte por medio ------------------------------- */

function ReportePorMedio({ reporte, rango }: { reporte: CajaResumen | null; rango: { desde: string; hasta: string } }) {
  if (!reporte) return null;
  const rotulo = rango.desde || rango.hasta
    ? `Período ${rango.desde || '…'} → ${rango.hasta || '…'}`
    : 'Histórico completo';
  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <h2>Reporte por medio de pago</h2>
        <span className="badge">{rotulo}</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
        <div className="stat-grid">
          <MiniStat label="Ingresos" value={ars(reporte.ingresos)} tint="var(--success-bg)" color="var(--success)" />
          <MiniStat label="Egresos" value={ars(reporte.egresos)} tint="var(--danger-bg)" color="var(--danger)" />
          <MiniStat label="Neto" value={ars(reporte.neto)} tint="var(--brand-050)" color={reporte.neto >= 0 ? 'var(--success)' : 'var(--danger)'} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Medio</th>
                <th style={{ textAlign: 'right' }}>Ingresos</th>
                <th style={{ textAlign: 'right' }}>Egresos</th>
                <th style={{ textAlign: 'right' }}>Neto</th>
                <th style={{ textAlign: 'right' }}>Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porMedio.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Sin movimientos en el período.</div></td></tr>
              )}
              {reporte.porMedio.map((p) => (
                <tr key={p.medio}>
                  <td><span className="badge badge-info">{CAJA_MEDIO_LABEL[p.medio]}</span></td>
                  <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{ars(p.ingresos)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{ars(p.egresos)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: p.neto >= 0 ? 'var(--text)' : 'var(--danger)' }}>{ars(p.neto)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{p.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Helpers ------------------------------------- */

function MiniStat({ label, value, tint, color, hint }: {
  label: string; value: string; tint: string; color?: string; hint?: string;
}) {
  return (
    <div className="card stat">
      <div className="stat-label"><span className="stat-ico" style={{ background: tint }}>💵</span>{label}</div>
      <div className="stat-value" style={{ color, fontSize: 24 }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

const filterBar: React.CSSProperties = {
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
  padding: '14px 20px', borderBottom: '1px solid var(--border)',
};
const dateWrap: React.CSSProperties = { display: 'grid', gap: 4, flex: '0 0 auto' };
const dateLbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 600 };
const pager: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  padding: '14px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap',
};
const noticeCard: React.CSSProperties = {
  background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-br)',
  padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 14,
};
const dangerCard: React.CSSProperties = {
  color: 'var(--danger)', borderColor: 'var(--danger-br)', background: 'var(--danger-bg)',
  border: '1px solid var(--danger-br)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 14,
};
