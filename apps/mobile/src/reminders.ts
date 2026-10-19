import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {secrets} from './security';
import {type Records,value} from './repository';
import {nextPayments} from '../../../src/core/dashboard';
import {Temporal,quietUntil} from '../../../src/core/dates';
export async function requestReminders(){if(Platform.OS==='web')return false;const p=await Notifications.requestPermissionsAsync();if(!p.granted)throw new Error('Notification permission is off. You can enable it in device settings.');return true;}
export async function updateLocalReminders(r:Records){
 if(Platform.OS==='web')return;
 if(!(await Notifications.getPermissionsAsync()).granted)return;
 const old=JSON.parse(await secrets.get('notifications')??'[]') as string[];for(const id of old)await Notifications.cancelScheduledNotificationAsync(id);
 const ids:string[]=[],next=nextPayments(r.loan,r.loan_payment);
 for(const reminder of r.reminder.filter(x=>x.enabled)){
  const time=value(reminder,'time_local','19:00').split(':').map(Number);
  if(reminder.kind==='study'){
   const deferred=quietUntil(Temporal.Now.plainDateISO(value(reminder,'zone','Africa/Kigali')).toZonedDateTime({timeZone:value(reminder,'zone','Africa/Kigali'),plainTime:value(reminder,'time_local','19:00')}).toInstant().toString(),value(reminder,'zone','Africa/Kigali'),value(reminder,'quiet_start','22:00'),value(reminder,'quiet_end','07:00'));
   const at=deferred?Temporal.Instant.from(deferred).toZonedDateTimeISO(value(reminder,'zone','Africa/Kigali')).toPlainTime():null;
   ids.push(await Notifications.scheduleNotificationAsync({content:{title:'Bruce’s Life',body:'Time for a little learning.',data:{reminder_id:reminder.id}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DAILY,hour:at?.hour??time[0]??19,minute:at?.minute??time[1]??0}}));
  }else{
   const due=reminder.kind==='loan'?next.find(n=>n.loan_id===reminder.target_id)?.due_on:value(reminder,'due_on');if(!due)continue;
   for(const days of [3,1,0]){const target=Temporal.PlainDate.from(due).subtract({days}).toZonedDateTime({timeZone:value(reminder,'zone','Africa/Kigali'),plainTime:value(reminder,'time_local','09:00')}).toInstant().toString(),at=quietUntil(target,value(reminder,'zone','Africa/Kigali'),value(reminder,'quiet_start','22:00'),value(reminder,'quiet_end','07:00'))??target;if(Date.parse(at)<=Date.now())continue;
    ids.push(await Notifications.scheduleNotificationAsync({content:{title:'Bruce’s Life',body:'You have a payment reminder.',data:{reminder_id:reminder.id}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(at)}}));
   }
  }
 }
 await secrets.set('notifications',JSON.stringify(ids));
}
