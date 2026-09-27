import crypto from 'node:crypto';
import {getPool} from './pool.mjs';

const providers = new Set(['google', 'naver']);
const tokenHash = token => crypto.createHash('sha256').update(token).digest();

function normalizedProfile(profile) {
  if (!providers.has(profile?.provider)) throw new Error('unsupported auth provider');
  if (!profile.id || !String(profile.id).trim()) throw new Error('provider user id is required');
  return {
    provider: profile.provider,
    subject: String(profile.id),
    name: String(profile.name || '아이랑코스 사용자').slice(0, 80),
    email: profile.email ? String(profile.email).trim().toLowerCase() : null,
    picture: profile.picture ? String(profile.picture) : null,
    verified: profile.email_verified ?? null,
    snapshot: JSON.stringify(profile)
  };
}

async function selectIdentity(connection, provider, subject, lock = false) {
  const rows = await connection.query(`
    SELECT u.id, u.display_name, u.email, u.avatar_url, u.status,
           ai.provider, ai.provider_subject
    FROM auth_identities ai
    JOIN users u ON u.id = ai.user_id
    WHERE ai.provider = ? AND ai.provider_subject = ?
    ${lock ? 'FOR UPDATE' : ''}
  `, [provider, subject]);
  return rows[0] || null;
}

export async function findOrCreateSocialUser(rawProfile) {
  const profile = normalizedProfile(rawProfile);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const existing = await selectIdentity(connection, profile.provider, profile.subject, true);
    if (existing) {
      await connection.query(`
        UPDATE auth_identities
        SET provider_email=?, email_verified=?, profile_snapshot=?, last_login_at=current_timestamp(6)
        WHERE provider=? AND provider_subject=?
      `, [profile.email, profile.verified, profile.snapshot, profile.provider, profile.subject]);
      await connection.query(`
        UPDATE users SET display_name=?, email=?, avatar_url=?, last_login_at=current_timestamp(6)
        WHERE id=? AND status='active'
      `, [profile.name, profile.email, profile.picture, existing.id]);
      await connection.commit();
      return {...existing, display_name: profile.name, email: profile.email, avatar_url: profile.picture};
    }

    const userId = crypto.randomUUID();
    await connection.query(`
      INSERT INTO users (id,display_name,email,avatar_url,last_login_at)
      VALUES (?,?,?,?,current_timestamp(6))
    `, [userId, profile.name, profile.email, profile.picture]);
    await connection.query(`
      INSERT INTO auth_identities
        (id,user_id,provider,provider_subject,provider_email,email_verified,profile_snapshot)
      VALUES (?,?,?,?,?,?,?)
    `, [crypto.randomUUID(), userId, profile.provider, profile.subject, profile.email, profile.verified, profile.snapshot]);
    await connection.query('INSERT INTO families (id,created_by) VALUES (?,?)', [crypto.randomUUID(), userId]);
    await connection.commit();
    return {
      id: userId, display_name: profile.name, email: profile.email, avatar_url: profile.picture,
      status: 'active', provider: profile.provider, provider_subject: profile.subject
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const winner = await selectIdentity(connection, profile.provider, profile.subject);
      if (winner) return winner;
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function createSession(userId, {userAgent = null, ipAddress = null, days = 7} = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  await getPool().query(`
    INSERT INTO user_sessions
      (id,user_id,refresh_token_hash,user_agent,ip_address,expires_at)
    VALUES (?,?,?,?,?,date_add(current_timestamp(6), INTERVAL ? DAY))
  `, [sessionId, userId, tokenHash(token), userAgent, ipAddress, days]);
  return {sessionId, token, maxAge: days * 24 * 60 * 60};
}

export async function findSession(token) {
  if (!token) return null;
  const rows = await getPool().query(`
    SELECT s.id AS session_id, s.user_id, s.expires_at,
           u.display_name, u.email, u.avatar_url,
           (SELECT ai.provider FROM auth_identities ai WHERE ai.user_id=u.id ORDER BY ai.last_login_at DESC LIMIT 1) AS provider
    FROM user_sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.refresh_token_hash=? AND s.revoked_at IS NULL
      AND s.expires_at>current_timestamp(6) AND u.status='active'
    LIMIT 1
  `, [tokenHash(token)]);
  if (!rows[0]) return null;
  await getPool().query('UPDATE user_sessions SET last_used_at=current_timestamp(6) WHERE id=?', [rows[0].session_id]);
  return rows[0];
}

export async function revokeSession(token) {
  if (!token) return;
  await getPool().query(`
    UPDATE user_sessions SET revoked_at=current_timestamp(6)
    WHERE refresh_token_hash=? AND revoked_at IS NULL
  `, [tokenHash(token)]);
}
