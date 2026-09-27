import {findSession} from '../../database/auth-repository.mjs';
import {ApiError} from './http.mjs';

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const [key, ...parts] = item.trim().split('=');
    return [key, decodeURIComponent(parts.join('='))];
  }));
}

export async function requireUser(req) {
  const session = await findSession(cookies(req).airang_session);
  if (!session) throw new ApiError(401, 'authentication_required');
  return session;
}
