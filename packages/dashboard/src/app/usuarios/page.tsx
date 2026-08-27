'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type AdminUser, type AdminRole, type SucursalInfo,
} from '../../lib/api';

/**
 * Gestor de usuarios del panel (solo admin). Permite crear operadores por
 * sucursal, cambiarles rol/sucursal, resetear la contraseña y eliminarlos.
 */
export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Formulario de alta.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('operador');
  const [sucursal, setSucursal] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [u, s] = await Promise.all([api.users(), api.sucursales()]);
    setUsers(u);
    setSucursales(s);
    if (!sucursal && s[0]) setSucursal(s[0].nombre);
  }

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    if (!auth.isAdmin()) {
      router.replace('/');
      return;
    }
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudieron cargar los usuarios.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 3500);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createUser({
        email: email.trim(),
        password,
        role,
        sucursal: role === 'operador' ? sucursal : null,
      });
      setEmail('');
      setPassword('');
      setRole('operador');
      await reload();
      flash('Usuario creado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(u: AdminUser, newRole: AdminRole) {
    try {
      await api.updateUser(u.id, {
        role: newRole,
        sucursal: newRole === 'operador' ? (u.sucursal ?? sucursales[0]?.nombre ?? '') : null,
      });
      await reload();
      flash('Rol actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  async function changeSucursal(u: AdminUser, nombre: string) {
    try {
      await api.updateUser(u.id, { sucursal: nombre });
      await reload();
      flash('Sucursal actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  async function resetPassword(u: AdminUser) {
    const nueva = window.prompt(`Nueva contraseña para ${u.email} (mín. 6 caracteres):`);
    if (!nueva) return;
    try {
      await api.updateUser(u.id, { password: nueva });
      flash('Contraseña actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  async function removeUser(u: AdminUser) {
    if (!window.confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.deleteUser(u.id);
      await reload();
      flash('Usuario eliminado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;

  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 900 }}>
      <section>
        <h2 style={{ margin: '0 0 4px' }}>Usuarios del panel</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
          El <strong>admin</strong> ve todas las sucursales. Cada <strong>operador</strong> ve
          solo las inscripciones ya cerradas de su sucursal.
        </p>
      </section>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      {/* Alta de usuario */}
      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 14px' }}>Nuevo usuario</h3>
        <form onSubmit={createUser} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Email</span>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@escuelastop.com" style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Contraseña</span>
              <input
                type="text" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mín. 6 caracteres" style={inputStyle}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Rol</span>
              <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} style={inputStyle}>
                <option value="operador">Operador (una sucursal)</option>
                <option value="admin">Administrador (todas)</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Sucursal</span>
              <select
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
                disabled={role === 'admin'}
                style={{ ...inputStyle, opacity: role === 'admin' ? 0.5 : 1 }}
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.nombre}>{s.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? 'Creando…' : '+ Crear usuario'}
            </button>
          </div>
        </form>
      </section>

      {/* Listado */}
      <section>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Rol</th>
              <th style={th}>Sucursal</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={td}>{u.email}</td>
                <td style={td}>
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as AdminRole)}
                    style={miniSelect}
                  >
                    <option value="operador">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={td}>
                  {u.role === 'admin' ? (
                    <span style={{ color: '#94a3b8' }}>Todas</span>
                  ) : (
                    <select
                      value={u.sucursal ?? ''}
                      onChange={(e) => changeSucursal(u, e.target.value)}
                      style={miniSelect}
                    >
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.nombre}>{s.nombre}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => resetPassword(u)} style={linkBtn}>Resetear clave</button>
                  <button onClick={() => removeUser(u)} style={{ ...linkBtn, color: '#dc2626' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td style={td} colSpan={4}>Sin usuarios.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: '1 1 220px' };
const labelStyle = { fontSize: 13, color: '#475569', fontWeight: 600 };
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%',
};
const primaryBtn = {
  padding: '9px 18px', background: '#0f172a', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const miniSelect = { padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 };
const linkBtn = {
  background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
  fontSize: 13, marginLeft: 12, padding: 0,
};
const noticeStyle = {
  background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 14,
};
const errorStyle = {
  background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14,
};
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
