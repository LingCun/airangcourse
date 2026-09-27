import {getPool} from '../database/pool.mjs';
import {handleError, json, methodNotAllowed} from './_shared/http.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const preferences = await getPool().query(
      'SELECT code,label,category FROM preference_catalog WHERE is_active=true ORDER BY sort_order,code'
    );
    const facilities = await getPool().query('SELECT code,label FROM facility_catalog ORDER BY code');
    return json(res, 200, {preferences, facilities});
  } catch (error) { return handleError(res, error); }
}
