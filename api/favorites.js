import {getPool} from '../database/pool.mjs';
import {requireUser} from './_shared/session.mjs';
import {ApiError, body, handleError, json, methodNotAllowed} from './_shared/http.mjs';

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    if (req.method === 'GET') {
      const rows = await getPool().query(`
        SELECT p.id,p.name,p.category,p.road_address,p.latitude,p.longitude,fp.created_at
        FROM favorite_places fp JOIN places p ON p.id=fp.place_id
        WHERE fp.user_id=? ORDER BY fp.created_at DESC
      `, [user.user_id]);
      return json(res, 200, {places: rows});
    }
    if (req.method === 'POST') {
      const placeId = body(req).placeId;
      if (!placeId) throw new ApiError(400, 'place_id_required');
      await getPool().query('INSERT IGNORE INTO favorite_places (user_id,place_id) VALUES (?,?)', [user.user_id, placeId]);
      return json(res, 201, {saved: true});
    }
    if (req.method === 'DELETE') {
      const placeId = req.query.placeId;
      if (!placeId) throw new ApiError(400, 'place_id_required');
      await getPool().query('DELETE FROM favorite_places WHERE user_id=? AND place_id=?', [user.user_id, placeId]);
      return json(res, 200, {saved: false});
    }
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (error) { return handleError(res, error); }
}
