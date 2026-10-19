import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('apps/mobile/src',root),{recursive:true});
const sql=await readFile(new URL('src/mobile/schema.sql',root),'utf8');
await writeFile(new URL('apps/mobile/src/schema.ts',root),`// Generated from the shared SQLite schema.\nexport const schema = ${JSON.stringify(sql)};\n`);
