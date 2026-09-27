export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res, methods) {
  res.setHeader('allow', methods.join(', '));
  return json(res, 405, {error: 'method_not_allowed'});
}

export function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { throw new ApiError(400, 'invalid_json'); }
}

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function handleError(res, error) {
  if (error instanceof ApiError) return json(res, error.status, {error: error.code});
  console.error(error);
  return json(res, 500, {error: 'internal_server_error'});
}
