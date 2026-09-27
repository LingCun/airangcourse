import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import mariadb from 'mariadb';
import {databaseConfig} from './config.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const pool=mariadb.createPool(databaseConfig());
let connection;
try {
  connection=await pool.getConnection();
  const lock=await connection.query("SELECT GET_LOCK('airangcourse_schema_migrations',30) AS acquired");
  if(Number(lock[0].acquired)!==1) throw new Error('could not acquire migration lock');
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename varchar(255) PRIMARY KEY, checksum char(64) NOT NULL,
    applied_at datetime(6) NOT NULL DEFAULT current_timestamp(6)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const directory=join(here,'migrations');
  const filenames=(await readdir(directory)).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  for(const filename of filenames){
    const sql=await readFile(join(directory,filename),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    const applied=await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?',[filename]);
    if(applied.length){
      if(applied[0].checksum!==checksum) throw new Error(`applied migration was modified: ${filename}`);
      console.log(`skip ${filename}`); continue;
    }
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (filename,checksum) VALUES (?,?)',[filename,checksum]);
    console.log(`apply ${filename}`);
  }
} finally {
  if(connection){await connection.query("SELECT RELEASE_LOCK('airangcourse_schema_migrations')").catch(()=>{});connection.release();}
  await pool.end();
}
