import {refreshPlacesFromNaver} from '../database/naver-place-repository.mjs';
import {requireUser} from './_shared/session.mjs';
import {ApiError, body, handleError, json, methodNotAllowed} from './_shared/http.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    await requireUser(req);
    const region = String(body(req).region || '').trim();
    if (region.length < 2 || region.length > 80) throw new ApiError(400, 'valid_region_required');
    const result = await refreshPlacesFromNaver(region);
    return json(res, 200, result);
  } catch (error) {
    if (error.code === 'naver_search_not_configured') return json(res, 503, {error: error.code});
    return handleError(res, error);
  }
}
