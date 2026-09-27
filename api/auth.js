import crypto from 'node:crypto';
import {recordLoginEvent} from '../database/audit-repository.mjs';
import {createSession, findOrCreateSocialUser, findSession, revokeSession} from '../database/auth-repository.mjs';

const cookieName = 'airang_session';
const stateCookieName = 'airang_oauth_state';
const sign = value => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(value).digest('base64url');
const pack = payload => { const value = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${value}.${sign(value)}`; };
const unpack = value => {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => {
  const [key, ...parts] = item.trim().split('=');
  return [key, decodeURIComponent(parts.join('='))];
}));
const setCookie = (res, name, value, maxAge) => {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', current ? [...(Array.isArray(current) ? current : [current]), cookie] : cookie);
};
const redirect = (res, url) => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
const appUrl = req => process.env.APP_URL || `https://${req.headers.host}`;
const audit = (req, event) => recordLoginEvent(req, event).catch(error => console.error('audit log failed', error));

async function googleProfile(code, callback) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code'})
  });
  const token = await response.json();
  if (!response.ok) throw new Error(token.error_description || 'Google token exchange failed');
  const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {headers: {authorization: `Bearer ${token.access_token}`}});
  if (!profile.ok) throw new Error('Google profile failed');
  return profile.json();
}

async function naverProfile(code, state) {
  const url = new URL('https://nid.naver.com/oauth2.0/token');
  url.search = new URLSearchParams({grant_type: 'authorization_code', client_id: process.env.NAVER_CLIENT_ID, client_secret: process.env.NAVER_CLIENT_SECRET, code, state});
  const response = await fetch(url);
  const token = await response.json();
  if (!response.ok || token.error) throw new Error(token.error_description || 'NAVER token exchange failed');
  const profileResponse = await fetch('https://openapi.naver.com/v1/nid/me', {headers: {authorization: `Bearer ${token.access_token}`}});
  const profile = await profileResponse.json();
  if (!profileResponse.ok || profile.resultcode !== '00') throw new Error(profile.message || 'NAVER profile failed');
  return profile.response;
}

export default async function handler(req, res) {
  const action = req.query.action;
  const origin = appUrl(req);
  const callback = `${origin}/api/auth`;
  try {
    if (action === 'google-start' || action === 'naver-start') {
      const provider = action.split('-')[0];
      await audit(req, {provider, result: 'started'});
      const state = crypto.randomBytes(24).toString('base64url');
      setCookie(res, stateCookieName, pack({state, provider, exp: Date.now() + 600000}), 600);
      const url = provider === 'google' ? new URL('https://accounts.google.com/o/oauth2/v2/auth') : new URL('https://nid.naver.com/oauth2.0/authorize');
      url.search = provider === 'google'
        ? new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account'})
        : new URLSearchParams({client_id: process.env.NAVER_CLIENT_ID, redirect_uri: callback, response_type: 'code', state});
      return redirect(res, url.toString());
    }
    if (req.query.code && req.query.state) {
      const stored = unpack(cookies(req)[stateCookieName]);
      if (!stored || stored.state !== req.query.state || stored.exp < Date.now()) throw new Error('OAuth state mismatch');
      const profile = stored.provider === 'google' ? await googleProfile(req.query.code, callback) : await naverProfile(req.query.code, req.query.state);
      const user = stored.provider === 'google'
        ? {provider: 'google', id: profile.sub, name: profile.name, email: profile.email, picture: profile.picture}
        : {provider: 'naver', id: profile.id, name: profile.name || profile.nickname, email: profile.email, picture: profile.profile_image};
      const databaseUser = await findOrCreateSocialUser(user);
      const session = await createSession(databaseUser.id, {
        userAgent: req.headers['user-agent'] || null,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null
      });
      await audit(req, {userId: databaseUser.id, provider: user.provider, email: user.email, result: 'success'});
      setCookie(res, cookieName, session.token, session.maxAge);
      setCookie(res, stateCookieName, '', 0);
      return redirect(res, `${origin}/?login=success`);
    }
    if (action === 'session') {
      const session = await findSession(cookies(req)[cookieName]);
      res.setHeader('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({user: session ? {
        id: session.user_id, name: session.display_name, email: session.email,
        picture: session.avatar_url, provider: session.provider
      } : null}));
    }
    if (action === 'logout') {
      const token = cookies(req)[cookieName];
      const session = await findSession(token);
      await audit(req, {provider: session?.provider, email: session?.email, result: 'logout'});
      await revokeSession(token);
      setCookie(res, cookieName, '', 0); return redirect(res, origin);
    }
    res.statusCode = 400; res.end('Unknown auth action');
  } catch (error) {
    console.error(error);
    await audit(req, {provider: action?.startsWith('naver') ? 'naver' : action?.startsWith('google') ? 'google' : undefined, result: 'failure', reason: error.message});
    return redirect(res, `${origin}/?login=error`);
  }
}
