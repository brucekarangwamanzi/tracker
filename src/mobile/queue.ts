import type {Command} from '../server/validation.js';
import type {Table} from '../shared/schema.js';
// Predict only this device's already queued writes. Remote edits still produce
// normal server conflicts; this does not blindly rebase a conflicting amount.
export function expectedBaseVersion(confirmed:number,table:Table,id:string,commands:readonly Command[]):number{
 let base=confirmed;
 for(const c of commands){
  if(c.kind==='mutate'&&c.table===table&&c.id===id)base=Math.max(base,c.base_version+1);
  if(c.kind==='loan_create'&&table==='loan'&&c.id===id)base=Math.max(base,1);
  if(c.kind==='loan_payment'&&table==='loan'&&c.loan_id===id)base=Math.max(base,c.base_version+1);
 }
 return base;
}
