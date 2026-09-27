export function databaseConfig(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env or set the environment variable.');
  }

  const url = new URL(env.DATABASE_URL);
  if (!['mariadb:', 'mysql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the mariadb:// or mysql:// protocol.');
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: env.DATABASE_SSL === 'true',
    multipleStatements: true,
    connectionLimit: 5,
    bigIntAsNumber: true
  };
}
