import React from 'react';
import {View,Pressable} from 'react-native';
import {router} from 'expo-router';
import {useLife} from '../context';
import {useTheme} from '../theme';
import {Screen,Card,Txt,Between,Row,Button,Progress,Badge,Icon,Section,SyncMark,Amount} from '../ui';
import {today,value} from '../repository';
import {Temporal,localDate} from '../../../../src/core/dates';
import {timeZone} from '../locale';
export default function Home(){
 const{records:r,home:h,mode}=useLife(),t=useTheme();if(!r||!h)return null;
 const skill=r.skill[0],minutes=h.today_study_minutes,goal=60,pct=Math.min(100,Math.round(minutes*100/goal));
 const weekly=r.skill.reduce((n,s)=>n+Number(s.weekly_minutes),0);
 const weekStart=Temporal.PlainDate.from(today()).subtract({days:Temporal.PlainDate.from(today()).dayOfWeek-1}).toString();
 const studyByDay=new Map<string,number>();for(const session of r.study_session){const date=localDate(String(session.started_at),timeZone());studyByDay.set(date,(studyByDay.get(date)??0)+Number(session.minutes));}
 const studied=[...studyByDay].filter(([day])=>day>=weekStart&&day<=today()).reduce((n,[,minutes])=>n+minutes,0);
 const pref=r.setting.find(s=>s.key==='preferences'),minimum=pref?Number(JSON.parse(String(pref.value_json)).minimum_minutes??15):15;
 return <Screen title="Good morning, Bruce" subtitle={new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:timeZone()})} action={<SyncMark/>}>
 {mode==='demo'?<Badge text="Demo · sample data, saved locally" icon="flask-outline" tone="blue"/>:null}
 <Card style={{gap:18}}><Between><View style={{gap:5,flex:1}}><Txt size={13} color={t.muted}>Today’s focus</Txt><Txt size={24} weight="800">{skill?value(skill,'name'):'Your next small step'}</Txt><Row style={{gap:5}}><Txt size={28} color={t.green} weight="800">{minutes}</Txt><Txt color={t.muted}>/ {goal} min</Txt></Row></View><View style={{alignItems:'center',justifyContent:'center',height:82,width:82,borderWidth:6,borderColor:t.green,borderRadius:45}}><Txt size={21} weight="800">{pct}%</Txt></View></Between><Progress value={pct}/><Button label={skill?'Resume study':'Add your first skill'} icon="play" onPress={()=>router.push(skill?`/skill/${skill.id}`:'/add-skill')}/></Card>
 <Card onPress={()=>router.push('/money')} label="Open monthly budget"><Between><Row><Icon name="wallet-outline" color={t.green}/><Txt size={14} color={t.muted}>Budget remaining</Txt></Row><Icon name="chevron-forward" size={17}/></Between><Amount amount={h.budget_left} color={t.green}/><Txt size={12} color={t.muted}>of RWF {BigInt(h.budget_limit).toLocaleString('en-US')} this month</Txt><Progress value={BigInt(h.budget_limit)>0n?Number((BigInt(h.budget_limit)-BigInt(h.budget_left))*100n/BigInt(h.budget_limit)):0}/></Card>
 <Card onPress={()=>router.push(h.next_loan_payment?`/loan/${h.next_loan_payment.loan_id}`:'/loans')} label="Open next loan payment"><Between><Row><Icon name="calendar-outline" color={t.amber}/><Txt size={14} color={t.muted}>Next loan payment</Txt></Row><Icon name="chevron-forward" size={17}/></Between>{h.next_loan_payment?<><Amount amount={h.next_loan_payment.amount} size={28}/><Between><Txt size={14}>{h.next_loan_payment.name}</Txt><Badge text={h.next_loan_payment.due_on} tone={h.next_loan_payment.due_on<today()?'red':'amber'}/></Between></>:<Txt color={t.muted}>No upcoming payments. A little room to breathe.</Txt>}</Card>
 <Card><Between><Row><Icon name="flame-outline" color={t.amber}/><View><Txt weight="800" size={22}>{h.streak} {h.streak===1?'day':'days'}</Txt><Txt color={t.muted} size={12}>Study streak · keep your rhythm</Txt></View></Row><View style={{flexDirection:'row',gap:5}}>{['M','T','W','T','F','S','S'].map((d,i)=><View key={i} style={{alignItems:'center',gap:8}}><Txt size={10} color={t.muted}>{d}</Txt><View style={{height:8,width:8,borderRadius:4,backgroundColor:(studyByDay.get(Temporal.PlainDate.from(weekStart).add({days:i}).toString())??0)>=minimum?t.green:t.line}}/></View>)}</View></Between></Card>
 <Section title="This week’s learning" right={<Pressable accessibilityRole="button" onPress={()=>router.push('/skills')}><Txt color={t.green} size={14}>View skills</Txt></Pressable>}/><Card><Between><Txt weight="700">{Math.floor(studied/60)}h {studied%60}m</Txt><Txt color={t.muted} size={14}>of {Math.floor(weekly/60)} hours</Txt></Between><Progress value={weekly?studied*100/weekly:0}/></Card>
 </Screen>;
}
