import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrations = readdirSync(join(here, 'migrations'))
  .filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name))
  .sort()
  .map(name => readFileSync(join(here, 'migrations', name), 'utf8'));

for (const [index, sql] of migrations.entries()) {
  if (!sql.trim().endsWith(';')) throw new Error(`migration ${index + 1} must end with a semicolon`);
}

const schema = migrations.join('\n');
const requiredTables = [
  'users', 'auth_identities', 'user_sessions', 'oauth_states',
  'families', 'family_members', 'children', 'family_preferences',
  'places', 'place_facilities', 'place_hours', 'courses',
  'course_stops', 'favorite_places', 'consent_records'
];

for (const table of requiredTables) {
  if (!new RegExp(`CREATE TABLE ${table}\\s*\\(`).test(schema)) {
    throw new Error(`missing table: ${table}`);
  }
}

const requiredAuthConstraints = [
  'UNIQUE (provider, provider_subject)',
  'UNIQUE (user_id, provider)',
  'refresh_token_hash binary(32) NOT NULL UNIQUE'
];

for (const constraint of requiredAuthConstraints) {
  if (!schema.includes(constraint)) {
    throw new Error(`missing auth constraint: ${constraint}`);
  }
}

console.log(`schema verification passed: ${requiredTables.length} core tables`);
