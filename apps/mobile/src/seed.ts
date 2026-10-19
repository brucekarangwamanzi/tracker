import {type LifeRepository,today,now,uid,row} from './repository';
import {writeRow,readRows} from '../../../src/mobile/local';
import {tables} from '../../../src/shared/schema';
import {timeZone} from './locale';
import {Temporal} from '../../../src/core/dates';
import {schedule} from '../../../src/core/loans';
import type {Table,Value} from '../../../src/shared/schema';
export async function seedLife(repo:LifeRepository,sample:boolean){
 const existing=await repo.raw.getFirstAsync<{n:number}>('SELECT COUNT(*) AS n FROM wallet WHERE user_id=?',repo.user);if(existing?.n)return;
 const base=Temporal.PlainDate.from(today());
 // Sample records stay in their own offline-only demo database, never a real account.
 await repo.db.withExclusiveTransactionAsync(async tx=>{
  const insert=async(table:Table,data:Record<string,Value>)=>{const id=uid();await writeRow(tx,table,row(repo.user,id,data));return id;};
  const wallets=[];for(const method of ['Cash','Bank','MTN MoMo','Airtel Money'])wallets.push(await insert('wallet',{name:method,currency:'RWF',method}));
  const cats:Record<string,string>={};for(const [name,kind] of [['Food & groceries','expense'],['Transport','expense'],['Learning','expense'],['Loan payments','expense'],['Other expenses','expense'],['Salary','income'],['Freelance','income'],['Other income','income']])cats[name!]=await insert('category',{name:name!,kind:kind!});
  await insert('setting',{key:'preferences',value_json:JSON.stringify({timezone:timeZone(),minimum_minutes:15,push_enabled:false})});
  await insert('setting',{key:'last_wallet',value_json:JSON.stringify({wallet_id:wallets[2]})});
  if(!sample)return;
  const skillIds=[];for(const [name,goal,weekly,cost] of [['UI Design','Build my first portfolio',300,'75000'],['JavaScript','Build useful things',240,'0'],['French','Feel at home in conversation',180,'0']] as const)skillIds.push(await insert('skill',{name,goal,weekly_minutes:weekly,course_cost:cost}));
  for(const [i,titles,weights] of [[0,['Research foundations','Wireframes and layouts','Build a case study'],[34,34,32]],[1,['Learn the fundamentals','Build a small project'],[42,58]],[2,['Everyday vocabulary','Hold a conversation'],[24,76]]] as const){for(let n=0;n<titles.length;n++)await insert('milestone',{skill_id:skillIds[i]!,title:titles[n]!,weight:weights[n]!,completed:i===0?n<2:n===0});}
  for(let d=11;d>=0;d--){const day=base.subtract({days:d});const mins=d===0?35:30;const started=day.toZonedDateTime({timeZone:timeZone(),plainTime:'08:00'}).toInstant();await insert('study_session',{skill_id:skillIds[d===0?0:d%3]!,minutes:mins,started_at:(d===0?Temporal.Instant.from(now()).subtract({minutes:mins}):started).toString()});}
  const entries=[
   [1,'income','650000','Salary','Monthly salary',null], [2,'income','150000','Freelance','Portfolio website',skillIds[0]], [0,'income','25000','Other income','Cash received',null], [3,'income','25000','Other income','Side project',null],
   [1,'expense','300000','Learning','Design bootcamp',skillIds[0]],[1,'expense','50000','Transport','Monthly transport',null],[2,'expense','12500','Food & groceries','Weekly groceries',null],
  ] as const;
  // Opening transfers make each wallet match the designed example without editing balances.
  for(const [wallet,kind,amount,category,note,skill] of entries)await insert('entry',{wallet_id:wallets[wallet]!,kind,amount,category_id:cats[category]!,occurred_on:today(),transfer_id:null,payment_id:null,skill_id:skill??null,note});
  // Correct sample to the documented RWF 850,000 income / RWF 312,500 expense.
  const learning=await tx.getFirstAsync<{id:string}>('SELECT id FROM entry WHERE user_id=? AND note=?',repo.user,'Design bootcamp');
  if(learning)await tx.runAsync('UPDATE entry SET amount=CAST(? AS INTEGER) WHERE id=? AND user_id=?','250000',learning.id,repo.user);
  const out=uid(),into=uid();await insert('transfer',{from_wallet_id:wallets[1]!,to_wallet_id:wallets[2]!,amount:'47500',occurred_on:today(),out_id:out,in_id:into});
  // Dedicated IDs keep both transfer legs linked to the operation.
  const tr=await tx.getFirstAsync<{id:string}>('SELECT id FROM transfer WHERE user_id=? AND out_id=?',repo.user,out);
  for(const [id,wallet,kind] of [[out,wallets[1],'transfer_out'],[into,wallets[2],'transfer_in']] as const)await writeRow(tx,'entry',row(repo.user,id,{wallet_id:wallet!,kind,amount:'47500',occurred_on:today(),category_id:null,transfer_id:tr!.id,payment_id:null,skill_id:null,note:'Wallet transfer'}));
  const second=uid(),secondOut=uid(),secondIn=uid();
  await writeRow(tx,'transfer',row(repo.user,second,{from_wallet_id:wallets[1]!,to_wallet_id:wallets[3]!,amount:'2500',occurred_on:today(),out_id:secondOut,in_id:secondIn}));
  for(const [id,wallet,kind] of [[secondOut,wallets[1],'transfer_out'],[secondIn,wallets[3],'transfer_in']] as const)await writeRow(tx,'entry',row(repo.user,id,{wallet_id:wallet!,kind,amount:'2500',occurred_on:today(),category_id:null,transfer_id:second,payment_id:null,skill_id:null,note:'Wallet transfer'}));
  for(const [name,limit] of [['Food & groceries','150000'],['Transport','100000'],['Learning','250000']])await insert('budget',{category_id:cats[name!]!,month:today().slice(0,7),limit:limit!});
  const first25=base.day<=25?base.with({day:25}):base.add({months:1}).with({day:25});
  const friday=base.add({days:(5-base.dayOfWeek+7)%7||7});
  const nextMonth=base.add({months:1}).with({day:1});
  for(const data of [
   {name:'Equipment loan',lender_type:'bank',lender_name:'Bank',principal:'1200000',annual_rate_bps:1200,dates:schedule({kind:'monthly',first:first25.toString(),day:25,count:60,payment:'100000'})},
   {name:'SACCO loan',lender_type:'sacco',lender_name:'My SACCO',principal:'300000',annual_rate_bps:800,dates:schedule({kind:'weekly',first:friday.toString(),count:40,payment:'25000'})},
   {name:'Mobile loan',lender_type:'mobile',lender_name:'Mobile lending',principal:'100000',annual_rate_bps:0,dates:schedule({kind:'custom',dates:[{due_on:base.add({days:9}).toString(),amount:'50000'},{due_on:base.add({days:24}).toString(),amount:'50000'}]})},
   {name:'Family loan',lender_type:'friend_family',lender_name:'Family',principal:'50000',annual_rate_bps:0,dates:schedule({kind:'custom',dates:[{due_on:nextMonth.toString(),amount:'25000'},{due_on:nextMonth.add({months:1}).toString(),amount:'25000'}]})}
  ])await insert('loan',{name:data.name,lender_type:data.lender_type,lender_name:data.lender_name,principal:data.principal,interest:'0',remainder:'0',annual_rate_bps:data.annual_rate_bps,accrued_on:today(),status:'active',schedule_json:JSON.stringify(data.dates)});
  await insert('reminder',{kind:'study',target_id:null,due_on:null,time_local:'19:00',zone:timeZone(),quiet_start:'22:00',quiet_end:'07:00',enabled:false});
 });
 if(!sample){
  for(const table of ['wallet','category','setting'] as const){
   const rows=await readRows(repo.db,repo.user,table);
   for(const existing of rows){const data=Object.fromEntries(Object.keys(tables[table]).map(k=>[k,existing[k]??null])) as Record<string,Value>;await repo.save(table,data,existing);}
  }
 }
}
