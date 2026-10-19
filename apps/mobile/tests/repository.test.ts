import {describe,it,expect,vi,beforeAll} from 'vitest';
import initSqlJs,{type Database as SqlDb} from 'sql.js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {type SQLiteDatabase} from 'expo-sqlite';
import {LifeRepository,balances,plan,today} from '../src/repository';
import {seedLife} from '../src/seed';
import {expectedBaseVersion} from '../../../src/mobile/queue';
import {cashflow} from '../../../src/core/money';
import {asEntry} from '../../../src/core/dashboard';
import type {Command} from '../../../src/server/validation';
vi.mock('../src/security',()=>({secrets:{get:async()=>null,set:async()=>{}}}));
let SQL:Awaited<ReturnType<typeof initSqlJs>>,schema:string;
beforeAll(async()=>{SQL=await initSqlJs();schema=await readFile('../../src/mobile/schema.sql','utf8');});
class Raw{
 db:SqlDb;constructor(){this.db=new SQL.Database();this.db.run(schema);}
 async runAsync(sql:string,...params:(string|number|null)[]){this.db.run(sql,params);return{changes:this.db.getRowsModified()};}
 async getAllAsync<T>(sql:string,...params:(string|number|null)[]):Promise<T[]>{const stmt=this.db.prepare(sql);try{stmt.bind(params);const out:T[]=[];while(stmt.step())out.push(stmt.getAsObject() as T);return out;}finally{stmt.free();}}
 async getFirstAsync<T>(sql:string,...params:(string|number|null)[]):Promise<T|null>{return(await this.getAllAsync<T>(sql,...params))[0]??null;}
 async withTransactionAsync(fn:()=>Promise<void>){this.db.run('BEGIN');try{await fn();this.db.run('COMMIT');}catch(e){this.db.run('ROLLBACK');throw e;}}
}
function repo(demo=true){return new LifeRepository(new Raw() as unknown as SQLiteDatabase,randomUUID(),demo);}
describe('app screens → repository → real SQLite',()=>{
 it('loads the exact demo balances and reconciles spending without counting transfers',async()=>{
  const db=repo();await seedLife(db,true);const r=await db.all();
  expect(balances(r).map(w=>w.balance.toString())).toEqual(['25000','300000','185000','27500']);
  expect(cashflow(r.entry.map(asEntry))).toEqual({income:850000n,expense:312500n});
  const h=await db.home();expect(h.budget_left).toBe('187500');expect(r.loan).toHaveLength(4);expect(h.streak).toBeGreaterThanOrEqual(11);
  await seedLife(db,true);expect((await db.all()).wallet).toHaveLength(4);
 });
 it('saves an expense, remembers its wallet, and supports a soft-delete undo',async()=>{
  const db=repo();await seedLife(db,true);const r=await db.all(),wallet=r.wallet[2]!,category=r.category.find(c=>c.name==='Food & groceries')!;
  const before=balances(r)[2]!.balance;
  await db.addTransaction({kind:'expense',amount:'25000',wallet_id:wallet.id,category_id:category.id,occurred_on:today(),note:'Test groceries'});
  let after=await db.all();expect(balances(after)[2]!.balance).toBe(before-25000n);expect(JSON.parse(String(after.setting.find(s=>s.key==='last_wallet')!.value_json)).wallet_id).toBe(wallet.id);
  const entry=after.entry.find(e=>e.note==='Test groceries')!;await db.archiveEntry(entry);after=await db.all();expect(after.entry.some(e=>e.id===entry.id)).toBe(false);expect(balances(after)[2]!.balance).toBe(before);
 });
 it('queues fresh private defaults in dependency order for future server sync',async()=>{
  const db=repo(false);await seedLife(db,false);const r=await db.all();expect(r.entry).toHaveLength(0);expect(r.skill).toHaveLength(0);expect((await db.pending())!.n).toBe(14);
  const pending=await db.db.getAllAsync<{command_json:string}>('SELECT command_json FROM local_outbox ORDER BY queue_sequence');expect(JSON.parse(pending[0]!.command_json).table).toBe('wallet');
 });
 it('records linked loan payments atomically and predicts the queued versions',async()=>{
  const db=repo();await seedLife(db,true);let r=await db.all();const loan=r.loan.find(l=>l.name==='Family loan')!,wallet=r.wallet[0]!,cat=r.category.find(c=>c.name==='Loan payments')!;
  // Demo seed has no server version; model an acknowledged starting loan.
  await db.db.runAsync('UPDATE loan SET version=1 WHERE id=?',loan.id);
  r=await db.all();await db.payLoan(r.loan.find(l=>l.id===loan.id)!,wallet.id,cat.id,'10000',today());
  r=await db.all();await db.payLoan(r.loan.find(l=>l.id===loan.id)!,wallet.id,cat.id,'5000',today());
  r=await db.all();expect(r.loan.find(l=>l.id===loan.id)!.principal).toBe('35000');expect(r.loan_payment.filter(p=>p.loan_id===loan.id)).toHaveLength(2);expect(r.entry.filter(e=>e.payment_id)).toHaveLength(2);
  const cmds=await db.db.getAllAsync<{command_json:string}>('SELECT command_json FROM local_outbox ORDER BY queue_sequence');expect(cmds.map(c=>JSON.parse(c.command_json)).filter(c=>c.kind==='loan_payment').map(c=>c.base_version)).toEqual([1,2]);
 });
 it('rejects decimals and overpayment without altering the database',async()=>{
  const db=repo();await seedLife(db,true);const r=await db.all(),loan=r.loan.find(l=>l.name==='Family loan')!,cat=r.category.find(c=>c.name==='Loan payments')!;
  await expect(db.addTransaction({kind:'expense',amount:'12.50',wallet_id:r.wallet[0]!.id,category_id:cat.id,occurred_on:today(),note:''})).rejects.toThrow();
  await expect(db.payLoan(loan,r.wallet[0]!.id,cat.id,'999999',today())).rejects.toThrow('OVERPAYMENT');expect((await db.all()).loan_payment).toHaveLength(0);
 });
 it('serializes rapid loan payments against the latest local balance',async()=>{
  const db=repo();await seedLife(db,true);const r=await db.all(),loan=r.loan.find(l=>l.name==='Family loan')!,cat=r.category.find(c=>c.name==='Loan payments')!;
  await Promise.all([db.payLoan(loan,r.wallet[0]!.id,cat.id,'10000',today()),db.payLoan(loan,r.wallet[0]!.id,cat.id,'5000',today())]);
  const after=await db.all();expect(after.loan.find(l=>l.id===loan.id)!.principal).toBe('35000');expect(after.loan_payment.reduce((n,p)=>n+BigInt(String(p.principal)),0n)).toBe(15000n);
 });
 it('supports extra-payment simulation and unsynced create/edit version chains',async()=>{
  const db=repo();await seedLife(db,true);const r=await db.all(),loan=r.loan.find(l=>l.name==='Equipment loan')!;expect(plan(r,loan,'25000').days_saved).toBeGreaterThan(0);
  const id=randomUUID(),commands:Command[]=[{op_id:randomUUID(),kind:'mutate',table:'note',id,base_version:0,deleted_at:null,data:{content:'First'}}];expect(expectedBaseVersion(0,'note',id,commands)).toBe(1);
 });
});
