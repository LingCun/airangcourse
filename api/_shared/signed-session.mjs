import crypto from 'node:crypto';
import {findSession} from '../../database/auth-repository.mjs';

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const [key, ...parts] = item.trim().split('=');
    return [key, decodeURIComponent(parts.join('='))];
  }));
}

export function unpackSigned(value) {
  if (!value || !process.env.AUTH_SECRET) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

export async function currentSignedUser(req) {
  const token = parseCookies(req).airang_session;
  const databaseSession = await findSession(token);
  if (databaseSession) return {
    userId: databaseSession.user_id,
    name: databaseSession.display_name,
    email: databaseSession.email,
    picture: databaseSession.avatar_url,
    provider: databaseSession.provider
  };
  return unpackSigned(token);
}

export function isAdmin(user) {
  const allowed = (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && allowed.includes(String(user.email).toLowerCase()));
}
