import {recordPageView} from '../database/audit-repository.mjs';
import {body, handleError, json, methodNotAllowed, ApiError} from './_shared/http.mjs';
import {currentSignedUser} from './_shared/signed-session.mjs';

const validKey = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const input = body(req);
    if (!validKey.test(input.pageKey || '')) throw new ApiError(400, 'invalid_page_key');
    if (!String(input.visitorId || '').trim() || String(input.visitorId).length > 64) throw new ApiError(400, 'invalid_visitor_id');
    const user = await currentSignedUser(req);
    await recordPageView(req, {
      visitorId: input.visitorId,
      pageKey: input.pageKey,
      pageTitle: input.pageTitle,
      path: input.path || '/',
      referrer: input.referrer,
      userId: user?.userId
    });
    return json(res, 201, {ok: true});
  } catch (error) { return handleError(res, error); }
}
