import crypto from 'node:crypto';
import {getPool} from '../database/pool.mjs';
import {requireUser} from './_shared/session.mjs';
import {ApiError, body, handleError, json, methodNotAllowed} from './_shared/http.mjs';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function handler(req, res) {
  let connection;
  try {
    const user = await requireUser(req);
    connection = await getPool().getConnection();
    if (req.method === 'GET') {
      const rows = await connection.query(`
        SELECT c.id,c.title,c.status,c.travel_date,c.region,c.transport,c.starts_at,c.ends_at,
               c.budget,c.estimated_cost,c.updated_at,
               (SELECT count(*) FROM course_stops cs WHERE cs.course_id=c.id) AS stop_count
        FROM courses c WHERE c.user_id=? ORDER BY c.updated_at DESC LIMIT 50
      `, [user.user_id]);
      return json(res, 200, {courses: rows});
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
    const input = body(req);
    const stops = Array.isArray(input.stops) ? input.stops : [];
    if (!input.title || !stops.length) throw new ApiError(400, 'course_title_and_stops_required');
    if (input.startsAt && !timePattern.test(input.startsAt)) throw new ApiError(400, 'invalid_start_time');
    if (input.endsAt && !timePattern.test(input.endsAt)) throw new ApiError(400, 'invalid_end_time');
    const budget = input.budget === '' || input.budget == null ? null : Number(input.budget);
    if (budget != null && (!Number.isInteger(budget) || budget < 0)) throw new ApiError(400, 'invalid_budget');
    for (const stop of stops) {
      if (!stop.name || !Number.isFinite(Number(stop.latitude)) || !Number.isFinite(Number(stop.longitude))) {
        throw new ApiError(400, 'invalid_course_stop');
      }
    }

    const families = await connection.query('SELECT family_id FROM family_members WHERE user_id=? ORDER BY (role="owner") DESC LIMIT 1', [user.user_id]);
    const courseId = crypto.randomUUID();
    await connection.beginTransaction();
    await connection.query(`
      INSERT INTO courses
        (id,user_id,family_id,title,status,travel_date,region,transport,starts_at,ends_at,budget,input_snapshot)
      VALUES (?,?,?,?,'saved',?,?,?,?,?,?,?)
    `, [courseId, user.user_id, families[0]?.family_id || null, String(input.title).slice(0, 160),
      input.travelDate || null, input.region || null, input.transport || 'car', input.startsAt || null,
      input.endsAt || null, budget, JSON.stringify(input.inputSnapshot || {})]);
    for (const [position, stop] of stops.entries()) {
      await connection.query(`
        INSERT INTO course_stops
          (id,course_id,place_id,position,kind,name_snapshot,latitude_snapshot,longitude_snapshot,arrival_at,estimated_cost,memo,metadata)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `, [crypto.randomUUID(), courseId, stop.placeId || null, position, stop.kind || 'place',
        String(stop.name).slice(0, 200), Number(stop.latitude), Number(stop.longitude), stop.arrivalAt || null,
        stop.estimatedCost == null ? null : Number(stop.estimatedCost), stop.memo || null, JSON.stringify(stop.metadata || {})]);
    }
    await connection.commit();
    return json(res, 201, {course: {id: courseId, status: 'saved'}});
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return handleError(res, error);
  } finally { if (connection) connection.release(); }
}
