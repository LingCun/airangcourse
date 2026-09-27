import crypto from 'node:crypto';
import {getPool} from '../database/pool.mjs';
import {requireUser} from './_shared/session.mjs';
import {ApiError, body, handleError, json, methodNotAllowed} from './_shared/http.mjs';

async function familyForUser(connection, userId) {
  const rows = await connection.query(`
    SELECT f.id,f.name,f.adult_count,f.mobility_aid,fm.role
    FROM families f JOIN family_members fm ON fm.family_id=f.id
    WHERE fm.user_id=? ORDER BY (fm.role='owner') DESC,f.created_at LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

async function familyPayload(connection, userId) {
  const family = await familyForUser(connection, userId);
  if (!family) return null;
  const children = await connection.query(
    'SELECT id,nickname,birth_year,birth_month FROM children WHERE family_id=? ORDER BY created_at,id', [family.id]
  );
  const preferences = await connection.query(
    'SELECT preference_code AS code,weight FROM family_preferences WHERE family_id=? ORDER BY preference_code', [family.id]
  );
  return {...family, children, preferences};
}

export default async function handler(req, res) {
  let connection;
  try {
    const user = await requireUser(req);
    connection = await getPool().getConnection();
    if (req.method === 'GET') return json(res, 200, {family: await familyPayload(connection, user.user_id)});
    if (req.method !== 'PUT') return methodNotAllowed(res, ['GET', 'PUT']);

    const input = body(req);
    const adultCount = Number(input.adultCount);
    const childCount = Number(input.childCount);
    const childAge = Number(input.childAge);
    const mobilityAid = input.mobilityAid || 'none';
    const preferences = Array.isArray(input.preferences) ? [...new Set(input.preferences)] : [];
    if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 20) throw new ApiError(400, 'invalid_adult_count');
    if (!Number.isInteger(childCount) || childCount < 0 || childCount > 20) throw new ApiError(400, 'invalid_child_count');
    if (childCount && (!Number.isInteger(childAge) || childAge < 0 || childAge > 19)) throw new ApiError(400, 'invalid_child_age');
    if (!['wagon', 'stroller', 'none'].includes(mobilityAid)) throw new ApiError(400, 'invalid_mobility_aid');

    await connection.beginTransaction();
    let family = await familyForUser(connection, user.user_id);
    if (!family) {
      const familyId = crypto.randomUUID();
      await connection.query('INSERT INTO families (id,adult_count,mobility_aid,created_by) VALUES (?,?,?,?)',
        [familyId, adultCount, mobilityAid, user.user_id]);
      family = {id: familyId};
    } else {
      await connection.query('UPDATE families SET adult_count=?,mobility_aid=? WHERE id=?', [adultCount, mobilityAid, family.id]);
    }
    await connection.query('DELETE FROM children WHERE family_id=?', [family.id]);
    const birthYear = new Date().getFullYear() - childAge;
    for (let index = 0; index < childCount; index += 1) {
      await connection.query('INSERT INTO children (id,family_id,nickname,birth_year) VALUES (?,?,?,?)',
        [crypto.randomUUID(), family.id, childCount === 1 ? '아이' : `아이 ${index + 1}`, birthYear]);
    }
    await connection.query('DELETE FROM family_preferences WHERE family_id=?', [family.id]);
    for (const code of preferences) {
      const result = await connection.query('INSERT IGNORE INTO family_preferences (family_id,preference_code) VALUES (?,?)', [family.id, code]);
      if (!result.affectedRows) throw new ApiError(400, 'invalid_preference');
    }
    await connection.commit();
    return json(res, 200, {family: await familyPayload(connection, user.user_id)});
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return handleError(res, error);
  } finally { if (connection) connection.release(); }
}
