import {Platform} from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import {schema} from './schema';
import {commitLocal,readRows,writeRow,SyncCoordinator,httpTransport,type SqliteDatabase,type SqliteConnection} from '../../../src/mobile/local';
import {draftTransfer,draftPayment} from '../../../src/mobile/drafts';
import {localDashboard} from '../../../src/mobile/dashboard';
import {tables,type Table,type Row,type Value} from '../../../src/shared/schema';
import {formatRwf,positive,walletBalance} from '../../../src/core/money';
import {schedule,accrue,payoffComparison,remainingSchedule,type LoanState,type Schedule,type Installment} from '../../../src/core/loans';
import {localDate,Temporal} from '../../../src/core/dates';
import {weeklyReview,skillRoi} from '../../../src/core/reports';
import {asEntry,asSession} from '../../../src/core/dashboard';
import type {Command} from '../../../src/server/validation';
import {expectedBaseVersion} from '../../../src/mobile/queue';
import {secrets} from './security';
import {timeZone} from './locale';
export {formatRwf,asEntry,asSession,readRows};
export type {Row,Table,Schedule};
export const DEMO_USER='00000000-0000-4000-8000-000000000001';
export const uid=()=>Crypto.randomUUID();
export const today=()=>localDate(new Date().toISOString(),timeZone());
export const now=()=>new Date().toISOString();
export const value=(r:Row|undefined,key:string,fallback='')=>String(r?.[key]??fallback);
export const row=(user:string,id:string,data:Record<string,Value>,version=0):Row=>({...data,id,user_id:user,updated_at:now(),version,deleted_at:null});
export type Records=Record<Table,Row[]>;
export interface TransactionForm {kind:'income'|'expense';amount:string;wallet_id:string;category_id:string;occurred_on:string;note:string;skill_id?:string|null}
export class LifeRepository{
 readonly db:SqliteDatabase;private tail:Promise<unknown>=Promise.resolve();
 private mutationTail:Promise<unknown>=Promise.resolve();
 private coordinator:SyncCoordinator|null=null;
 constructor(readonly raw:SQLite.SQLiteDatabase,readonly user:string,readonly demo:boolean){
  this.db={runAsync:(...a)=>raw.runAsync(...a),getAllAsync:(...a)=>raw.getAllAsync(...a),getFirstAsync:(...a)=>raw.getFirstAsync(...a),withExclusiveTransactionAsync:fn=>this.exclusive(fn)};
 }
 private async exclusive(fn:(tx:SqliteConnection)=>Promise<void>){
  const run=this.tail.then(async()=>{
   if(Platform.OS==='web')await this.raw.withTransactionAsync(()=>fn(this.db));
   else await this.raw.withExclusiveTransactionAsync(tx=>fn(tx));
  });this.tail=run.catch(()=>{});await run;
 }
 private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.mutationTail.then(fn);this.mutationTail=task.catch(()=>{});return task;}
 async all():Promise<Records>{
  const records=await Promise.all(Object.keys(tables).map(async key=>[key,await readRows(this.db,this.user,key as Table)] as const));
  return Object.fromEntries(records) as Records;
 }
 save(table:Table,data:Record<string,Value>,existing?:Row){return this.enqueue(async()=>{
  const id=existing?.id??uid(),payload=Object.fromEntries(Object.keys(tables[table]).map(k=>[k,data[k]??existing?.[k]??null])) as Record<string,Value>;
  const command:Command={op_id:uid(),kind:'mutate',table,id,base_version:await this.base(table,id,existing?.version??0),deleted_at:null,data:payload};
  await commitLocal(this.db,this.user,command,[{table,row:row(this.user,id,payload,existing?.version??0)}]);return id;
 });}
 async base(table:Table,id:string,confirmed:number){const cmds=await this.db.getAllAsync<{command_json:string}>("SELECT command_json FROM local_outbox WHERE user_id=? AND status IN ('dirty','accepted') ORDER BY queue_sequence",this.user);return expectedBaseVersion(confirmed,table,id,cmds.map(c=>JSON.parse(c.command_json) as Command));}
 archiveEntry(existing:Row){return this.enqueue(async()=>{
  if(existing.transfer_id||existing.payment_id)throw new Error('Linked payments and transfers must stay together.');
  const data=Object.fromEntries(Object.keys(tables.entry).map(k=>[k,existing[k]??null])) as Record<string,Value>;
  const deleted_at=now(),command:Command={op_id:uid(),kind:'mutate',table:'entry',id:existing.id,base_version:await this.base('entry',existing.id,existing.version),deleted_at,data};
  await commitLocal(this.db,this.user,command,[{table:'entry',row:{...existing,deleted_at}}]);
 });}
 async setting(key:string,data:unknown){
  const old=(await readRows(this.db,this.user,'setting')).find(s=>s.key===key);
  await this.save('setting',{key,value_json:JSON.stringify(data)},old);
 }
 async preference(key:string,data:unknown){
  const s=(await readRows(this.db,this.user,'setting')).find(s=>s.key==='ui');
  const settings=s?JSON.parse(String(s.value_json)) as Record<string,unknown>:{};
  // App-only display preferences live locally; server preferences stay strict.
  await this.exclusive(tx=>writeRow(tx,'setting',row(this.user,s?.id??uid(),{key:'ui',value_json:JSON.stringify({...settings,[key]:data})},s?.version??0)));
 }
 async addTransaction(form:TransactionForm){
  positive(form.amount);Temporal.PlainDate.from(form.occurred_on);
  if(!form.wallet_id||!form.category_id)throw new Error('Choose a wallet and category.');
  await this.save('entry',{...form,skill_id:form.skill_id??null,transfer_id:null,payment_id:null});
  await this.setting('last_wallet',{wallet_id:form.wallet_id});
 }
 async resolveConflict(conflict:Row,choice:'server'|'client'){
  const server=JSON.parse(value(conflict,'server_json','null')) as Row|null;
  const command:Command={op_id:uid(),kind:'resolve',conflict_id:conflict.id,base_version:server?.version??0,choice};
  await commitLocal(this.db,this.user,command,[]);
 }
 async transfer(from:string,to:string,amount:string){const draft=draftTransfer(this.user,from,to,amount,today(),uid,now());await commitLocal(this.db,this.user,draft.command,draft.changes);}
 async addSkill(name:string,goal:string,weekly_minutes:number,cost:string,milestones:string[]){
  const id=await this.save('skill',{name,goal,weekly_minutes,course_cost:cost});
  for(const title of milestones.filter(Boolean))await this.save('milestone',{skill_id:id,title,completed:false,weight:1});return id;
 }
 async logStudy(skill:string,minutes:number,note=''){
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('Study time must be 1–1,440 whole minutes.');
  await this.save('study_session',{skill_id:skill,minutes,started_at:new Date(Date.now()-minutes*60000).toISOString()});
  if(note.trim())await this.save('note',{content:JSON.stringify({skill_id:skill,text:note,date:today()})});
 }
 async addLoan(data:{name:string;lender_type:string;lender_name:string;principal:string;annual_rate_bps:number;schedule:Schedule}){
  positive(data.principal);const id=uid(),dates=schedule(data.schedule);
  if(dates.some(d=>d.due_on<today()))throw new Error('New loan payments need dates today or later.');
  const cmd:Command={op_id:uid(),kind:'loan_create',id,...data,accrued_on:today(),lender_type:data.lender_type as 'bank'|'sacco'|'mobile'|'friend_family'};
  const fields={name:data.name,lender_type:data.lender_type,lender_name:data.lender_name,principal:data.principal,interest:'0',remainder:'0',annual_rate_bps:data.annual_rate_bps,accrued_on:today(),status:'active',schedule_json:JSON.stringify(dates)};
  await commitLocal(this.db,this.user,cmd,[{table:'loan',row:row(this.user,id,fields)}]);return id;
 }
 payLoan(loan:Row,wallet:string,category:string,amount:string,day:string){return this.enqueue(async()=>{
  if(day>today())throw new Error('A recorded payment cannot be in the future.');
  const current=(await readRows(this.db,this.user,'loan')).find(row=>row.id===loan.id);
  if(!current)throw new Error('This loan is no longer active.');
  const draft=draftPayment(this.user,current,wallet,category,amount,day,uid,now());
  if(draft.command.kind==='loan_payment')draft.command.base_version=await this.base('loan',current.id,current.version);
  await commitLocal(this.db,this.user,draft.command,draft.changes);
 });}
 async home(){return localDashboard(this.db,this.user,now());}
 async pending(){return this.raw.getFirstAsync<{n:number}>("SELECT COUNT(*) AS n FROM local_outbox WHERE user_id=? AND status='dirty'",this.user);}
 sync(url:string,getToken:()=>Promise<string>){this.coordinator??=new SyncCoordinator(this.db,this.user,httpTransport(url,getToken));return this.coordinator.run();}
}
const repositories=new Map<string,Promise<LifeRepository>>();
export function openLife(user:string,demo:boolean){
 const key=`${demo?'demo':'private'}:${user}`;
 if(!repositories.has(key))repositories.set(key,(async()=>{
  const raw=await SQLite.openDatabaseAsync(`bruce-${demo?'demo':'private'}-${user}.db`);
  if(Platform.OS!=='web'&&!demo){
   const cipher=await raw.getFirstAsync<Record<string,string>>('PRAGMA cipher_version;');
   if(!cipher||!Object.values(cipher).some(Boolean))throw new Error('Private records require the encrypted native development build. Sample demo works in Expo Go.');
   let key=await secrets.get('database-key-'+user);
   if(!key){key=Array.from(await Crypto.getRandomBytesAsync(32),b=>b.toString(16).padStart(2,'0')).join('');await secrets.set('database-key-'+user,key);}
   if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid device database key.');
   await raw.execAsync(`PRAGMA key = "x'${key}'";`);
  }
  await raw.execAsync('PRAGMA foreign_keys=ON;');
  const version=await raw.getFirstAsync<{user_version:number}>('PRAGMA user_version;');
  if((version?.user_version??0)===0){await raw.execAsync(schema);await raw.execAsync('PRAGMA user_version=1;');}
  return new LifeRepository(raw,user,demo);
 })().catch(error=>{repositories.delete(key);throw error;}));
 return repositories.get(key)!;
}
export function balances(records:Records){return records.wallet.map(w=>({wallet:w,balance:walletBalance(records.entry.map(asEntry),w.id)}));}
export function skillProgress(records:Records,id:string){const ms=records.milestone.filter(m=>m.skill_id===id),sum=ms.reduce((n,m)=>n+Number(m.weight),0);return sum?Math.round(ms.filter(m=>m.completed).reduce((n,m)=>n+Number(m.weight),0)*100/sum):0;}
export function stateOf(loan:Row):LoanState{return{principal:value(loan,'principal','0'),interest:value(loan,'interest','0'),remainder:value(loan,'remainder','0'),annual_rate_bps:Number(loan.annual_rate_bps),accrued_on:value(loan,'accrued_on')};}
export function plan(records:Records,loan:Row,extra:string){const paid=records.loan_payment.filter(p=>p.loan_id===loan.id).reduce((n,p)=>n+BigInt(value(p,'amount','0')),0n);return payoffComparison(accrue(stateOf(loan),today()),remainingSchedule(JSON.parse(value(loan,'schedule_json','[]')) as Installment[],paid.toString(),today()),extra);}
export function review(records:Records){return weeklyReview(today(),timeZone(),records.entry.map(asEntry),records.study_session.map(asSession),records.loan_payment.map(p=>({paid_on:value(p,'paid_on'),principal:value(p,'principal','0')})));}
export function roi(records:Records,skill:string){return skillRoi(skill,records.entry.map(asEntry),records.study_session.map(asSession));}
