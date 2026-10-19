import {Platform} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {File,Paths} from 'expo-file-system';
import {type Records,value,today,formatRwf} from './repository';
const escape=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const csv=(v:unknown)=>{let s=String(v??'');if(/^[=+@\t\r]/.test(s)||(/^-/u.test(s)&&!/^-[0-9]+$/.test(s)))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
function download(text:string,name:string,type:string){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportCsv(r:Records){
 const headers=['id','date','type','amount','currency','wallet','category','note','skill_id','loan_payment_id','transfer_id'];
 const lines=r.entry.map(e=>[e.id,e.occurred_on,e.kind,e.amount,'RWF',value(r.wallet.find(w=>w.id===e.wallet_id),'name'),value(r.category.find(c=>c.id===e.category_id),'name'),e.note,e.skill_id,e.payment_id,e.transfer_id].map(csv).join(','));
 const content='\uFEFF'+[headers.map(csv).join(','),...lines].join('\r\n'),name=`bruces-life-transactions-${today()}.csv`;
 if(Platform.OS==='web'){download(content,name,'text/csv;charset=utf-8');return;}
 const file=new File(Paths.cache,name);file.create({overwrite:true});file.write(content);await Sharing.shareAsync(file.uri,{mimeType:'text/csv',dialogTitle:'Export Bruce’s Life'});
}
export async function exportPdf(r:Records){
 const rows=r.entry.map(e=>`<tr><td>${escape(e.occurred_on)}</td><td>${escape(e.kind)}</td><td>${escape(formatRwf(BigInt(value(e,'amount','0'))))}</td><td>${escape(value(r.wallet.find(w=>w.id===e.wallet_id),'name'))}</td><td>${escape(e.note)}</td></tr>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px Arial;color:#142239;padding:28px}h1{font-size:26px}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border-bottom:1px solid #dce3ec;text-align:left;padding:9px;overflow-wrap:anywhere}th{background:#edf4f0}footer{margin-top:24px;color:#526276}</style></head><body><h1>Bruce’s Life</h1><p>Personal money report · ${today()} · RWF (whole francs)</p><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Wallet</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><h2>Loans</h2>${r.loan.map(l=>`<p>${escape(l.name)}: ${escape(formatRwf(BigInt(value(l,'principal','0'))))} principal remaining</p>`).join('')}<footer>Exported from records saved on this device. Transfers are wallet movements, not income or expenses.</footer></body></html>`;
 if(Platform.OS==='web'){await Print.printAsync({html});return;}
 const file=await Print.printToFileAsync({html});await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Export Bruce’s Life'});
}
