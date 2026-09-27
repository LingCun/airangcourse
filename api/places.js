import {getPool} from '../database/pool.mjs';
import {handleError, json, methodNotAllowed} from './_shared/http.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    const rows = await getPool().query(`
      SELECT p.id,p.naver_place_id,p.name,p.category,p.road_address,p.latitude,p.longitude,
             p.min_age,p.max_age,p.price_min,p.price_max,
             (SELECT group_concat(pf.facility_code ORDER BY pf.facility_code)
              FROM place_facilities pf WHERE pf.place_id=p.id) AS facilities
      FROM places p WHERE p.is_active=true ORDER BY p.name
    `);
    return json(res, 200, {places: rows.map(row => ({...row, facilities: row.facilities?.split(',') || []}))});
  } catch (error) { return handleError(res, error); }
}
