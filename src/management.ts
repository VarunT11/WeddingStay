import { normalizeData, type Dataset, type GuestGroup, type Invitation, type WeddingEvent } from './data';

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
export function guestReferences(data:Dataset,id:string):string[] {
  const refs:string[]=[];
  if(data.invitations.some(i=>i.guestGroupId===id))refs.push('event invitations');
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
export function deleteInvitation(data:Dataset,id:string):Dataset {
  return normalizeData({...data,invitations:data.invitations.filter(i=>i.id!==id)});
}
export function invitationSummary(data:Dataset,invitations:Invitation[]) {
  const confirmed=invitations.filter(i=>i.response==='Confirmed');
  const groups=invitations.map(i=>data.guests.find(g=>g.id===i.guestGroupId)!);
  return {groups:invitations.length,invited:groups.reduce((s,g)=>s+(g.headcount??0),0),unknown:groups.filter(g=>g.headcount===null).length,confirmed:confirmed.length,pending:invitations.filter(i=>i.response==='Pending').length,declined:invitations.filter(i=>i.response==='Declined').length,confirmedGuests:confirmed.reduce((s,i)=>s+(i.confirmedHeadcount??0),0),confirmedUnknown:confirmed.filter(i=>i.confirmedHeadcount===null).length};
}
