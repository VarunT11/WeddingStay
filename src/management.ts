import { normalizeData, type Dataset, type GuestGroup, type Invitation, type WeddingEvent } from './data';
import {mergeGuestAttendance,type AttendanceMergeChoice} from './attendance';

function stamped<T extends {id:string;createdAt?:string;updatedAt?:string}>(record:T,previous?:T):T {
  const now=new Date().toISOString();
  return {...record,createdAt:previous?.createdAt||now,updatedAt:now};
}
export function saveGuest(data:Dataset,guest:GuestGroup):Dataset {
  const name=guest.name.trim(),members=guest.members.map(n=>n.trim()).filter(Boolean);
  if(!name)throw new Error('Enter a guest or group name.');
  if(guest.headcount!==null&&(!Number.isInteger(guest.headcount)||guest.headcount<members.length||guest.headcount<0))throw new Error('Headcount must be a whole number covering all named members.');
  const next=stamped({...guest,name,members,category:guest.category.trim(),contact:guest.contact.trim(),notes:guest.notes.trim()},data.guests.find(g=>g.id===guest.id));
  return normalizeData({...data,guests:data.guests.some(g=>g.id===next.id)?data.guests.map(g=>g.id===next.id?next:g):[...data.guests,next]});
}
export function updateGuestAccommodation(data:Dataset,id:string,changes:Pick<GuestGroup,'needsAccommodation'|'headcount'>):Dataset {
 const guest=data.guests.find(item=>item.id===id);
 if(!guest)throw new Error('This guest group no longer exists. Close the editor and review the latest guest list.');
 return saveGuest(data,{...guest,...changes});
}
export function saveCategory(data:Dataset,name:string,id:string=crypto.randomUUID()):Dataset {
 const trimmed=name.trim();if(!trimmed)throw new Error('Enter a category name.');
 if(data.guestCategories.some(c=>c.id!==id&&c.name.toLowerCase()===trimmed.toLowerCase()))throw new Error('This category already exists.');
 const category=stamped({id,name:trimmed},data.guestCategories.find(c=>c.id===id));
 return normalizeData({...data,guestCategories:[...data.guestCategories.filter(c=>c.id!==id),category],guests:data.guests.map(g=>g.categoryId===id?{...g,category:trimmed}:g)});
}
export function removeCategory(data:Dataset,id:string):Dataset {
 return normalizeData({...data,guestCategories:data.guestCategories.filter(c=>c.id!==id),guests:data.guests.map(g=>g.categoryId===id?{...g,categoryId:undefined,category:''}:g)});
}
export function saveGuestEvents(data:Dataset,guest:GuestGroup,eventIds:string[]):Dataset {
 let next=saveGuest(data,guest);
 for(const eventId of eventIds)if(!next.invitations.some(i=>i.eventId===eventId&&i.guestGroupId===guest.id))next=addInvitations(next,eventId,[guest.id]);
 return next;
}
export function mergeGuests(data:Dataset,target:GuestGroup,sourceId:string,resolutions:Record<string,string>,attendanceChoices:Record<string,AttendanceMergeChoice>={}):Dataset {
 if(target.id===sourceId||!data.guests.some(g=>g.id===target.id)||!data.guests.some(g=>g.id===sourceId))throw new Error('Select two different existing guest groups.');
 const invitations=data.invitations.filter(i=>i.guestGroupId!==sourceId&&i.guestGroupId!==target.id);
 const linked=data.invitations.filter(i=>i.guestGroupId===sourceId||i.guestGroupId===target.id);
 for(const eventId of new Set(linked.map(i=>i.eventId))){const pair=linked.filter(i=>i.eventId===eventId);let chosen=pair[0];if(pair.length>1){const conflict=pair.some(i=>i.response!==chosen.response||i.confirmedHeadcount!==chosen.confirmedHeadcount);if(conflict){chosen=pair.find(i=>i.id===resolutions[eventId])!;if(!chosen)throw new Error('Resolve the duplicate invitation for '+data.events.find(e=>e.id===eventId)?.name+'.');}else chosen=pair.find(i=>i.guestGroupId===target.id)||chosen;}invitations.push(stamped({...chosen,guestGroupId:target.id},chosen));}
 const attendance=mergeGuestAttendance(data,target.id,sourceId,attendanceChoices);
 const next={...data,guests:data.guests.filter(g=>g.id!==sourceId),invitations,attendance,allocations:data.allocations.map(a=>a.guestGroupId===sourceId?{...a,guestGroupId:target.id}:a),requirements:data.requirements.map(r=>r.guestGroupId===sourceId?{...r,guestGroupId:target.id}:r)};
 return saveGuest(next,target);
}
export function guestReferences(data:Dataset,id:string):string[] {
  const refs:string[]=[];
  if(data.invitations.some(i=>i.guestGroupId===id))refs.push('event invitations');
  if(data.attendance.some(row=>row.guestGroupId===id))refs.push('event attendance');
  if(data.allocations.some(a=>a.guestGroupId===id))refs.push('saved stays');
  if(data.requirements.some(r=>r.guestGroupId===id))refs.push('room requirements');
  return refs;
}
export function deleteGuest(data:Dataset,id:string):Dataset {
  const refs=guestReferences(data,id);
  if(refs.length)throw new Error('This group is linked to '+refs.join(', ')+'. Keep it and edit its details instead.');
  return normalizeData({...data,guests:data.guests.filter(g=>g.id!==id)});
}
export function saveEvent(data:Dataset,event:WeddingEvent):Dataset {
  if(!event.name.trim())throw new Error('Enter an event name.');
  if(!event.location.trim())throw new Error('Enter an event location.');
  const next=stamped({...event,name:event.name.trim(),location:event.location.trim(),notes:event.notes.trim(),time:event.time||undefined},data.events.find(e=>e.id===event.id));
  return normalizeData({...data,events:data.events.some(e=>e.id===next.id)?data.events.map(e=>e.id===next.id?next:e):[...data.events,next]});
}
export function deleteEvent(data:Dataset,id:string):Dataset {
  if(data.attendance.some(row=>row.eventId===id))throw new Error('This event has recorded attendance. Keep it to preserve those records.');
  if(data.invitations.some(i=>i.eventId===id))throw new Error('Remove this event’s invitations before deleting it. Guest records will be kept.');
  return normalizeData({...data,events:data.events.filter(e=>e.id!==id)});
}
export function addInvitations(data:Dataset,eventId:string,guestIds:string[]):Dataset {
  if(!guestIds.length)throw new Error('Select at least one guest group.');
  if(!data.events.some(e=>e.id===eventId))throw new Error('Choose an existing event.');
  const existing=new Set(data.invitations.filter(i=>i.eventId===eventId).map(i=>i.guestGroupId));
  if(guestIds.some(id=>existing.has(id)))throw new Error('A selected group is already invited. Reopen the chooser to refresh it.');
  const invitations=[...new Set(guestIds)].map(guestGroupId=>stamped<Invitation>({id:crypto.randomUUID(),eventId,guestGroupId,response:'Pending',confirmedHeadcount:null}));
  return normalizeData({...data,invitations:[...data.invitations,...invitations]});
}
export function saveInvitation(data:Dataset,invitation:Invitation):Dataset {
  const previous=data.invitations.find(i=>i.id===invitation.id);
  if(!previous)throw new Error('This invitation no longer exists.');
  const next=stamped({...previous,response:invitation.response,confirmedHeadcount:invitation.response==='Confirmed'?invitation.confirmedHeadcount:null},previous);
  return normalizeData({...data,invitations:data.invitations.map(i=>i.id===next.id?next:i)});
}
export function updateGuestEvents(data:Dataset,guestId:string,eventIds:string[]):Dataset {
  if(!data.guests.some(g=>g.id===guestId))throw new Error('This guest group no longer exists.');
  const selected=new Set(eventIds);
  if([...selected].some(id=>!data.events.some(event=>event.id===id)))throw new Error('An event no longer exists. Reopen Edit events to refresh the list.');
  const invitations=data.invitations.filter(i=>i.guestGroupId!==guestId||selected.has(i.eventId));
  for(const eventId of selected)if(!invitations.some(i=>i.guestGroupId===guestId&&i.eventId===eventId))invitations.push(stamped<Invitation>({id:crypto.randomUUID(),eventId,guestGroupId:guestId,response:'Pending',confirmedHeadcount:null}));
  return normalizeData({...data,invitations});
}
export function deleteInvitation(data:Dataset,id:string):Dataset {
  return normalizeData({...data,invitations:data.invitations.filter(i=>i.id!==id)});
}
export function invitationSummary(data:Dataset,invitations:Invitation[]) {
  const confirmed=invitations.filter(i=>i.response==='Confirmed');
  const groups=invitations.map(i=>data.guests.find(g=>g.id===i.guestGroupId)!);
  return {groups:invitations.length,invited:groups.reduce((s,g)=>s+(g.headcount??0),0),unknown:groups.filter(g=>g.headcount===null).length,confirmed:confirmed.length,pending:invitations.filter(i=>i.response==='Pending').length,declined:invitations.filter(i=>i.response==='Declined').length,confirmedGuests:confirmed.reduce((s,i)=>s+(i.confirmedHeadcount??0),0),confirmedUnknown:confirmed.filter(i=>i.confirmedHeadcount===null).length};
}
