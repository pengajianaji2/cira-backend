import { pool } from '../../config/db.config.js';
import { ConflictError } from '../errors/AppError.js';

/** Session-scoped lock spans Drive I/O without holding a Prisma transaction open. */
export async function acquireResourceLock(key: string) {
  const client = await pool.connect();
  try {
    const {rows}=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[key]);
    if (!rows[0].locked) throw new ConflictError('Operasi lain sedang berjalan. Coba kembali.');
  } catch(error) { client.release(); throw error; }
  let released=false;
  return async () => {
    if(released)return;released=true;
    try {await client.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);client.release();}
    catch {client.release(true);}
  };
}
export async function withResourceLock<T>(key:string, action:()=>Promise<T>) {
  const release=await acquireResourceLock(key);
  try{return await action();}finally{await release();}
}
