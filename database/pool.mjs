import mariadb from 'mariadb';
import {databaseConfig} from './config.mjs';

let pool;

export function getPool() {
  if (!pool) pool = mariadb.createPool(databaseConfig());
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
