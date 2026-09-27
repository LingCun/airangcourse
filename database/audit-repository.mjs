import {getPool} from './pool.mjs';

const clip = (value, length) => value ? String(value).slice(0, length) : null;

export function clientIp(req) {
  return clip((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress, 45);
}

export async function recordLoginEvent(req, event) {
  await getPool().query(`
    INSERT INTO login_events
      (user_id,provider,email_snapshot,result,failure_reason,ip_address,user_agent)
    VALUES (?,?,?,?,?,?,?)
  `, [event.userId || null, event.provider || null, clip(event.email, 320), event.result,
      clip(event.reason, 120), clientIp(req), clip(req.headers['user-agent'], 2000)]);
}

export async function recordPageView(req, event) {
  await getPool().query(`
    INSERT INTO page_view_events
      (user_id,visitor_id,page_key,page_title,path,referrer,ip_address,user_agent)
    VALUES (?,?,?,?,?,?,?,?)
  `, [event.userId || null, clip(event.visitorId, 64), clip(event.pageKey, 80),
      clip(event.pageTitle, 160), clip(event.path, 500), clip(event.referrer, 500),
      clientIp(req), clip(req.headers['user-agent'], 2000)]);
}
