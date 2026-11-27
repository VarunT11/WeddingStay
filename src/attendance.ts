import {normalizeData,type Dataset,type EventAttendance,type EventLifecycle,type GuestGroup,type WeddingEvent} from './data';

export const eventLifecycle=(event:WeddingEvent):EventLifecycle=>event.lifecycle||'Upcoming';
export type EventDisplayMode='auto'|'rsvp'|'attendance';
export const eventDisplayMode=(event:WeddingEvent,mode:EventDisplayMode)=>mode==='auto'?(eventLifecycle(event)==='Upcoming'?'rsvp':'attendance'):mode;
export const attendanceFor=(data:Dataset,eventId:string,guestGroupId:string)=>data.attendance.find(row=>row.eventId===eventId&&row.guestGroupId===guestGroupId);
export const onEventRoster=(data:Dataset,eventId:string,guestGroupId:string)=>data.invitations.some(row=>row.eventId===eventId&&row.guestGroupId===guestGroupId)||data.attendance.some(row=>row.eventId===eventId&&row.guestGroupId===guestGroupId);
export function eventAttendanceSummary(data:Dataset,eventId:string){
 const records=data.attendance.filter(row=>row.eventId===eventId),roster=new Set([...data.invitations.filter(row=>row.eventId===eventId).map(row=>row.guestGroupId),...records.map(row=>row.guestGroupId)]),attended=records.filter(row=>row.status==='Attended'),absent=records.filter(row=>row.status==='Did not attend');
 return {groups:roster.size,attended:attended.length,actual:attended.reduce((sum,row)=>sum+(row.actualHeadcount??0),0),unknownCounts:attended.filter(row=>row.actualHeadcount===null).length,absent:absent.length,unreviewed:roster.size-attended.length-absent.length,added:records.filter(row=>row.source==='added-at-event').length};
}
export function changeEventLifecycle(data:Dataset,eventId:string,lifecycle:EventLifecycle,uid:string):Dataset{
 if(!data.events.some(event=>event.id===eventId))throw new Error('This event no longer exists.');
 const now=new Date().toISOString();return normalizeData({...data,events:data.events.map(event=>event.id===eventId?{...event,lifecycle,lifecycleChangedAt:now,lifecycleChangedBy:uid,updatedAt:now}:event)});
}
export function saveAttendance(data:Dataset,eventId:string,guestGroupId:string,details:Pick<EventAttendance,'status'|'actualHeadcount'|'notes'>,uid:string):Dataset{
 const old=attendanceFor(data,eventId,guestGroupId),now=new Date().toISOString();
 const row:EventAttendance={id:old?.id||'attendance-'+encodeURIComponent(eventId)+':'+encodeURIComponent(guestGroupId),eventId,guestGroupId,...details,source:old?.source||(data.invitations.some(i=>i.eventId===eventId&&i.guestGroupId===guestGroupId)?'invited':'added-at-event'),createdAt:old?.createdAt||now,updatedAt:now,updatedBy:uid};
 return normalizeData({...data,attendance:[...data.attendance.filter(record=>record.id!==row.id),row]});
}
export function addEventAttendee(data:Dataset,eventId:string,guest:GuestGroup,actualHeadcount:number|null,uid:string):Dataset{
 if(onEventRoster(data,eventId,guest.id))throw new Error('This guest is already listed for the event. Update the existing attendance entry.');
 const existing=data.guests.find(row=>row.id===guest.id),now=new Date().toISOString();
 const next=existing?data:{...data,guests:[...data.guests,{...guest,name:guest.name.trim(),createdAt:now,updatedAt:now}]};
 return saveAttendance(next,eventId,guest.id,{status:'Attended',actualHeadcount,notes:''},uid);
}
export type AttendanceMergeChoice={recordId:string;actualHeadcount?:number|null};
export function mergeGuestAttendance(data:Dataset,targetId:string,sourceId:string,choices:Record<string,AttendanceMergeChoice>={}):EventAttendance[]{
 const rows=data.attendance.filter(row=>row.guestGroupId!==targetId&&row.guestGroupId!==sourceId),linked=data.attendance.filter(row=>row.guestGroupId===targetId||row.guestGroupId===sourceId);
 for(const eventId of new Set(linked.map(row=>row.eventId))){const pair=linked.filter(row=>row.eventId===eventId),choice=choices[eventId];let row=pair[0];
  if(pair.length>1){row=pair.find(record=>record.id===choice?.recordId)!;if(!row)throw new Error('Resolve attendance for '+(data.events.find(event=>event.id===eventId)?.name||'this event')+'.');}
  rows.push({...row,guestGroupId:targetId,actualHeadcount:choice&&'actualHeadcount'in choice?choice.actualHeadcount!:row.actualHeadcount,source:pair.some(record=>record.source==='invited')?'invited':row.source,updatedAt:new Date().toISOString()});
 }
 return rows;
}
export type EventColumnPreferences={preset:'all'|'active'|'completed'|'custom';ids:string[];mode:EventDisplayMode};
export function selectedEventColumns(events:WeddingEvent[],preferences:EventColumnPreferences){return events.filter(event=>preferences.preset==='all'||preferences.preset==='active'&&eventLifecycle(event)!=='Completed'||preferences.preset==='completed'&&eventLifecycle(event)==='Completed'||preferences.preset==='custom'&&preferences.ids.includes(event.id)).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));}
