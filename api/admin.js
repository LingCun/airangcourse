import {getPool} from '../database/pool.mjs';
import {handleError, json, methodNotAllowed, ApiError} from './_shared/http.mjs';
import {currentSignedUser, isAdmin} from './_shared/signed-session.mjs';

const allowedDays = new Set([1, 7, 30, 90]);
const number = value => Number(value || 0);

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await currentSignedUser(req);
    if (!user) throw new ApiError(401, 'authentication_required');
    if (!isAdmin(user)) throw new ApiError(403, 'admin_required');

    const days = allowedDays.has(Number(req.query.days)) ? Number(req.query.days) : 7;
    const pool = getPool();
    const [summaryRows, pageRows, trendRows, loginRows, recentViewRows] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM page_view_events WHERE viewed_at >= date_sub(current_timestamp(), INTERVAL ? DAY)) AS views,
        (SELECT count(DISTINCT visitor_id) FROM page_view_events WHERE viewed_at >= date_sub(current_timestamp(), INTERVAL ? DAY)) AS visitors,
        (SELECT count(*) FROM login_events WHERE result='success' AND occurred_at >= date_sub(current_timestamp(), INTERVAL ? DAY)) AS logins,
        (SELECT count(*) FROM login_events WHERE result='failure' AND occurred_at >= date_sub(current_timestamp(), INTERVAL ? DAY)) AS failures`, [days, days, days, days]),
      pool.query(`SELECT page_key, coalesce(max(page_title),page_key) AS page_title,
        count(*) AS views, count(DISTINCT visitor_id) AS visitors,
        max(viewed_at) AS last_viewed_at
        FROM page_view_events WHERE viewed_at >= date_sub(current_timestamp(), INTERVAL ? DAY)
        GROUP BY page_key ORDER BY views DESC LIMIT 50`, [days]),
      pool.query(`SELECT date(viewed_at) AS day, count(*) AS views,
        count(DISTINCT visitor_id) AS visitors
        FROM page_view_events WHERE viewed_at >= date_sub(current_timestamp(), INTERVAL ? DAY)
        GROUP BY date(viewed_at) ORDER BY day`, [days]),
      pool.query(`SELECT provider,email_snapshot,result,failure_reason,ip_address,user_agent,occurred_at
        FROM login_events WHERE occurred_at >= date_sub(current_timestamp(), INTERVAL ? DAY)
        ORDER BY occurred_at DESC LIMIT 100`, [days]),
      pool.query(`SELECT page_key,page_title,path,visitor_id,ip_address,viewed_at
        FROM page_view_events WHERE viewed_at >= date_sub(current_timestamp(), INTERVAL ? DAY)
        ORDER BY viewed_at DESC LIMIT 100`, [days])
    ]);

    const raw = summaryRows[0] || {};
    return json(res, 200, {
      admin: {name: user.name, email: user.email}, days,
      summary: {views: number(raw.views), visitors: number(raw.visitors), logins: number(raw.logins), failures: number(raw.failures)},
      pages: pageRows.map(row => ({...row, views: number(row.views), visitors: number(row.visitors)})),
      trend: trendRows.map(row => ({...row, views: number(row.views), visitors: number(row.visitors)})),
      logins: loginRows,
      recentViews: recentViewRows
    });
  } catch (error) { return handleError(res, error); }
}
