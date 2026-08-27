import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type TokenPayload } from '../services/auth.js';

// Extiende Request para exponer el admin autenticado a los handlers.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: TokenPayload;
    }
  }
}

/**
 * Protege las rutas del dashboard. Espera `Authorization: Bearer <token>`.
 *
 * También acepta `?token=` en la query: un `<img src>` no puede enviar headers,
 * y así el panel puede mostrar las fotos de DNI/licencia sin dejar la ruta de
 * archivos abierta.
 *
 * Las rutas públicas (formulario del alumno, webhooks, catálogo) NO usan esto.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  req.admin = payload;
  next();
}

/**
 * Restringe una ruta al rol 'admin'. Debe usarse SIEMPRE después de requireAuth
 * (asume que req.admin ya está poblado). Los operadores reciben 403.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.admin?.role !== 'admin') {
    res.status(403).json({ error: 'Requiere permisos de administrador' });
    return;
  }
  next();
}
