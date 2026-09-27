import mariadb from 'mariadb';
import {databaseConfig} from './config.mjs';
const pool=mariadb.createPool(databaseConfig());
let connection;
try {
  connection=await pool.getConnection();
  const server=await connection.query('SELECT database() AS db_name,version() AS server_version');
  const migrations=await connection.query('SELECT filename,checksum,applied_at FROM schema_migrations ORDER BY filename');
  console.log(`database: ${server[0].db_name}`); console.log(`MariaDB ${server[0].server_version}`); console.table(migrations);
} finally {if(connection) connection.release();await pool.end();}
