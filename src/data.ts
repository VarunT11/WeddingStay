import { roomOccupancy,roomStayError,roomAssignments,withGuestCategories,withEventAttendance, STORAGE_KEY, LEGACY_STORAGE_KEY, MigrationRequired, seed, projectData, propertyForRoom, allocationOn, countOf, statusOf, isDate, overlaps, type Dataset, type Room, type Allocation, type StayAllocation, type DateRange, type HistoryEntry, type AllocationLabel, type LegacyDataset } from './model';
export * from './model';

export function summary(inventory: Room[]) {
  const rooms=inventory.filter(r=>r.booked!==false||r.overdue);
  return { total:rooms.length, available:rooms.filter(r=>statusOf(r)==='Available').length, allotted:rooms.filter(r=>statusOf(r)==='Allotted').length, occupied:rooms.filter(r=>statusOf(r)==='Occupied').length, capacity:rooms.reduce((s,r)=>s+r.capacity,0), assigned:rooms.reduce((s,r)=>s+roomOccupancy(r).assigned,0), arrived:rooms.reduce((s,r)=>s+roomOccupancy(r).arrived,0), pending:rooms.filter(r=>r.allocation?.headcountPending).length };
}
function requireValue(ok:unknown,message:string):asserts ok { if(!ok)throw new Error(message); }
function unique(rows:{id:string}[],name:string) {
  requireValue(Array.isArray(rows),`Missing ${name} records.`);
  const ids=new Set<string>();
  for(const row of rows){requireValue(row&&typeof row.id==='string'&&row.id.trim()&&!ids.has(row.id),`${name} IDs must be unique and nonempty.`);ids.add(row.id);}
  return ids;
}
function range(r:DateRange) { requireValue(isDate(r.checkIn)&&isDate(r.checkOut)&&r.checkIn<r.checkOut,'Choose valid check-in and checkout dates.'); }
function nullableCount(n:number|null) { return n===null||(Number.isInteger(n)&&n>=0); }
export function validateData(data: Dataset): void {
  requireValue(data?.version===3,'Saved data has an unsupported format.');
  data=withEventAttendance(data);
  requireValue(data.wedding&&typeof data.wedding.name==='string'&&data.wedding.name.trim()&&isDate(data.wedding.defaultDate),'Wedding settings are incomplete.');
  requireValue(typeof data.referenceData==='boolean'&&Number.isFinite(Date.parse(data.createdAt))&&Number.isFinite(Date.parse(data.updatedAt)),'Dataset metadata is incomplete.');
  const properties=unique(data.properties,'Property'),areas=unique(data.areas,'Area'),rooms=unique(data.rooms,'Room'),labels=unique(data.labels,'Label'),guests=unique(data.guests,'Guest group'),events=unique(data.events,'Event');
  unique(data.allocations,'Allocation');unique(data.invitations,'Invitation');unique(data.requirements,'Requirement');unique(data.history,'History');
  unique(data.attendance,'Attendance');
  const attendancePairs=new Set<string>();
  for(const record of data.attendance){const key=JSON.stringify([record.eventId,record.guestGroupId]);requireValue(events.has(record.eventId)&&guests.has(record.guestGroupId)&&!attendancePairs.has(key),'Attendance references must be valid and unique per event and guest group.');attendancePairs.add(key);requireValue(['Not recorded','Attended','Did not attend'].includes(record.status)&&['invited','added-at-event'].includes(record.source)&&typeof record.notes==='string'&&record.notes.length<=10000&&typeof record.updatedBy==='string'&&!!record.updatedBy,'Attendance details are invalid.');requireValue(record.status==='Attended'?(record.actualHeadcount===null||Number.isInteger(record.actualHeadcount)&&record.actualHeadcount>0):record.status==='Did not attend'?record.actualHeadcount===0:record.actualHeadcount===null,'Attendance count must match its status.');requireValue(!!record.updatedAt&&Number.isFinite(Date.parse(record.updatedAt))&&!!record.createdAt&&Number.isFinite(Date.parse(record.createdAt)),'Attendance timestamps are invalid.');}
  for(const event of data.events)requireValue(['Upcoming','In progress','Completed'].includes(event.lifecycle!)&&(event.lifecycleChangedAt===undefined||Number.isFinite(Date.parse(event.lifecycleChangedAt)))&&(event.lifecycleChangedBy===undefined||typeof event.lifecycleChangedBy==='string'),'Event lifecycle is invalid.');
  const named=(s:string)=>typeof s==='string'&&!!s.trim();
  const categories=unique(data.guestCategories||[],'Guest category'),categoryNames=new Set<string>();
  for(const category of data.guestCategories||[]){const key=category.name?.trim().toLowerCase();requireValue(named(category.name)&&!categoryNames.has(key),'Use a unique, nonempty guest category name.');categoryNames.add(key);}
  for(const guest of data.guests)requireValue(!guest.categoryId||categories.has(guest.categoryId),'Guest category no longer exists.');
  for(const p of data.properties){requireValue(named(p.name)&&Array.isArray(p.bookedRanges)&&typeof p.address==='string'&&typeof p.notes==='string','Property details are incomplete.');requireValue((p.contactName===undefined||typeof p.contactName==='string')&&(p.contactPhone===undefined||typeof p.contactPhone==='string'),'Property contact details must be text.');p.bookedRanges.forEach(range);}
  const areaNames=new Set<string>(),numbers=new Set<string>(),special=new Set<string>(),labelNames=new Set<string>();
  for(const a of data.areas){const key=a.propertyId+':'+a.name?.trim().toLowerCase();requireValue(properties.has(a.propertyId)&&named(a.name)&&!areaNames.has(key),'Use a unique area name within an existing property.');requireValue(typeof a.description==='string'&&typeof a.motif==='string','Area details are incomplete.');areaNames.add(key);}
  for(const label of data.labels){const key=label.name?.trim().toLowerCase();requireValue(named(label.name)&&!labelNames.has(key),'Use a unique, nonempty label name.');labelNames.add(key);}
  for(const r of data.rooms){
    const key=data.areas.find(a=>a.id===r.areaId)?.propertyId+':'+r.number?.trim().toLowerCase();
    requireValue(areas.has(r.areaId)&&named(r.number)&&!numbers.has(key),'Room numbers must be unique within their property.');numbers.add(key);
    requireValue(['Normal','Suite'].includes(r.type)&&Number.isInteger(r.capacity)&&r.capacity>0,'Room type or capacity is invalid.');
    if(r.special){requireValue(r.type==='Suite'&&['Bride Suite','Groom Suite'].includes(r.special)&&!special.has(r.special),'Only one Bride Suite and one Groom Suite are allowed.');special.add(r.special);}
  }
  for(const g of data.guests)requireValue(named(g.name)&&Array.isArray(g.members)&&g.members.every(named)&&nullableCount(g.headcount)&&typeof g.category==='string'&&typeof g.contact==='string'&&typeof g.notes==='string'&&(g.needsAccommodation===null||typeof g.needsAccommodation==='boolean'),'Guest group details are incomplete.');
  for(const e of data.events)requireValue(named(e.name)&&isDate(e.date)&&typeof e.location==='string'&&typeof e.notes==='string'&&(e.time===undefined||/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)),'Event details are incomplete.');
  const invitationPairs=new Set<string>();
  for(const i of data.invitations){const key=i.eventId+':'+i.guestGroupId;requireValue(events.has(i.eventId)&&guests.has(i.guestGroupId)&&['Pending','Confirmed','Declined'].includes(i.response)&&nullableCount(i.confirmedHeadcount)&&!invitationPairs.has(key),'Invitation details or references are invalid.');invitationPairs.add(key);}
  for(const a of data.allocations){
    requireValue(rooms.has(a.roomId)&&(!a.labelId||labels.has(a.labelId))&&(!a.guestGroupId||guests.has(a.guestGroupId)),'Allocation references a missing room, label or guest group.');
    range(a);requireValue(['active','completed','cancelled'].includes(a.lifecycle)&&typeof a.headcountPending==='boolean','Allocation lifecycle is invalid.');
    requireValue(typeof a.group==='string'&&typeof a.contact==='string'&&typeof a.notes==='string'&&Array.isArray(a.names)&&a.names.every(named)&&Number.isInteger(a.unnamed)&&a.unnamed>=0,'Enter valid allocation details.');
    const room=data.rooms.find(r=>r.id===a.roomId)!,total=countOf(a);
    requireValue(a.headcountPending?a.names.length===0&&a.unnamed===0:total>0,'Enter occupants or mark the headcount as pending.');
    requireValue(a.lifecycle!=='active'||total<=room.capacity,'Room capacity cannot be lower than the assigned guest count.');
    requireValue(Number.isInteger(a.arrived)&&a.arrived>=0&&a.arrived<=total&&a.checkedIn===(a.arrived>0)&&(!a.headcountPending||!a.checkedIn),'Arrival counts and check-in status must agree.');
    if(a.lifecycle==='active'){
      requireValue(!a.headcountPending||!!(a.group.trim()||a.guestGroupId),'Pending-headcount reservations need a group name or guest-group link.');
      requireValue(propertyForRoom(data,room)?.bookedRanges.some(r=>r.checkIn<=a.checkIn&&a.checkOut<=r.checkOut),'The stay must fit within the property booking.');
      const sharingError=roomStayError(data,a.roomId,a,a.id,false);requireValue(!sharingError,sharingError);
    }
  }
  for(const r of data.requirements){range(r);
    requireValue(!data.requirements.some(other=>other.id!==r.id&&other.labelId===r.labelId&&overlaps(other,r)&&(!other.propertyId||!r.propertyId||other.propertyId===r.propertyId)&&(!other.guestGroupId||!r.guestGroupId||other.guestGroupId===r.guestGroupId)),'Overlapping requirements would count the same allocations twice. Choose separate dates, labels or non-overlapping property/guest scopes.');requireValue(labels.has(r.labelId)&&(!r.propertyId||properties.has(r.propertyId))&&(!r.guestGroupId||guests.has(r.guestGroupId))&&Number.isInteger(r.roomsRequired)&&r.roomsRequired>0,'Room requirement details are invalid.');}
}
export function normalizeData(data:Dataset): Dataset { const next=withGuestCategories(withEventAttendance(data));validateData(next);return projectData(next); }
export function validateStayChanges(before:Dataset,next:Dataset):void {
 for(const stay of next.allocations){
  if(stay.lifecycle!=='active')continue;
  const previous=before.allocations.find(a=>a.id===stay.id);
  if(!previous||previous.lifecycle!=='active'||previous.roomId!==stay.roomId||previous.checkIn!==stay.checkIn||previous.checkOut!==stay.checkOut||stay.arrived>previous.arrived){
   const error=roomStayError(next,stay.roomId,stay,stay.id);
   if(error)throw new Error('Room '+next.rooms.find(r=>r.id===stay.roomId)?.number+': '+error);
  }
 }
}
export function initialData(): Dataset {
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved)return normalizeData(JSON.parse(saved));
  const legacy=localStorage.getItem(LEGACY_STORAGE_KEY);
  if(legacy){const parsed=JSON.parse(legacy) as LegacyDataset;if(parsed.version!==2||!Array.isArray(parsed.rooms)||!Array.isArray(parsed.areas)||!Array.isArray(parsed.history))throw new Error('Existing data could not be read. It has been kept unchanged.');throw new MigrationRequired(parsed);}
  const data=seed();validateData(data);return data;
}
export function defaultStay(data:Dataset,room:Room):DateRange {
  const checkIn=data.viewDate||data.wedding.defaultDate,checkOut=new Date(Date.parse(checkIn)+86400000).toISOString().slice(0,10);
  const dates={checkIn,checkOut};
  if(!propertyForRoom(data,room)?.bookedRanges.some(r=>r.checkIn<=checkIn&&checkOut<=r.checkOut))throw new Error('This property is not booked for the working date.');
  return dates;
}
export const historyTitles:Record<string,string>={'allocation-created':'Allocation created','allocation-edited':'Allocation edited','checked-in':'Guests checked in','arrivals-updated':'Arrival count updated','allocation-cancelled':'Allocation cancelled','checked-out':'Guests checked out','allocation-moved':'Allocation moved','action-recovered':'Action reversed'};
export function createHistoryEvent(data:Dataset,action:string,before:Room[],after:Room[],extra:Partial<HistoryEntry>={}):HistoryEntry {
  return {id:crypto.randomUUID(),at:new Date().toISOString(),action,roomId:before[0]?.id,allocationId:(before[0]?.allocation||after[0]?.allocation)?.id,before:structuredClone(before.map(({stays:_,...room})=>room)),after:structuredClone(after.map(({stays:_,...room})=>room)),roomNames:Object.fromEntries([...before,...after].map(r=>[r.id,r.number])),areaNames:Object.fromEntries(data.areas.map(a=>[a.id,a.name])),labelNames:Object.fromEntries(data.labels.map(l=>[l.id,l.name])),...extra};
}
export function changeAllocation(data:Dataset,roomId:string,allocation:Allocation|undefined,allocationId?:string):Dataset {
  const room=data.rooms.find(r=>r.id===roomId);if(!room)throw new Error('Room no longer exists.');
  const previous=allocationId?data.allocations.find(a=>a.id===allocationId&&a.roomId===roomId):allocation?.id?data.allocations.find(a=>a.id===allocation.id&&a.roomId===roomId):undefined,now=new Date().toISOString();
  if(allocationId&&!previous)throw new Error('This stay no longer exists.');
  if(previous&&previous.lifecycle!=='active')throw new Error('Completed and cancelled stays are read-only.');
  if(!allocation&&!previous)throw new Error('Choose the stay to release.');
  const nextAllocation:StayAllocation|undefined=allocation?{...allocation,...(allocation.checkIn&&allocation.checkOut?{checkIn:allocation.checkIn,checkOut:allocation.checkOut}:previous?{checkIn:previous.checkIn,checkOut:previous.checkOut}:defaultStay(data,room)),id:previous?.id||allocation.id||crypto.randomUUID(),roomId,lifecycle:'active',headcountPending:!!allocation.headcountPending,createdAt:previous?.createdAt||now,updatedAt:now,actualCheckIn:previous?.actualCheckIn||(allocation.checkedIn?now:undefined),actualCheckOut:undefined}:undefined;
  if(nextAllocation){const error=roomStayError(data,roomId,nextAllocation,previous?.id,!previous||nextAllocation.checkIn!==previous.checkIn||nextAllocation.checkOut!==previous.checkOut||nextAllocation.arrived>previous.arrived);if(error)throw new Error(error);}
  const before={...room,allocation:previous};
  const after={...room,allocation:nextAllocation,updatedAt:now};
  const action=!previous?'allocation-created':!nextAllocation?(previous.checkedIn?'checked-out':'allocation-cancelled'):!previous.checkedIn&&nextAllocation.checkedIn?'checked-in':previous.arrived!==nextAllocation.arrived?'arrivals-updated':'allocation-edited';
  const events=[createHistoryEvent(data,action,[before],[after])];
  if(!previous&&nextAllocation?.checkedIn){const allotted={...after,allocation:{...nextAllocation,arrived:0,checkedIn:false,actualCheckIn:undefined}};events[0]=createHistoryEvent(data,'allocation-created',[before],[allotted]);events.push(createHistoryEvent(data,'checked-in',[allotted],[after]));}
  const allocations=previous?data.allocations.map(a=>a.id===previous.id?(nextAllocation||{...a,lifecycle:previous.checkedIn?'completed' as const:'cancelled' as const,actualCheckOut:previous.checkedIn?now:undefined,updatedAt:now}):a):[...data.allocations,...(nextAllocation?[nextAllocation]:[])];
  return normalizeData({...data,updatedAt:now,allocations,rooms:data.rooms.map(r=>r.id===roomId?after:r),history:[...data.history,...events]});
}
export function moveAllocation(data:Dataset,sourceId:string,destinationId:string,allocationId?:string):Dataset {
  const source=data.rooms.find(r=>r.id===sourceId),destination=data.rooms.find(r=>r.id===destinationId),allocation=allocationId?data.allocations.find(a=>a.id===allocationId&&a.roomId===sourceId&&a.lifecycle==='active'):allocationOn(data,sourceId);
  if(!source||!allocation)throw new Error('The source room no longer has an allocation.');
  if(!destination||sourceId===destinationId)throw new Error('Choose a different destination room.');
  const destinationError=roomStayError(data,destinationId,allocation);if(destinationError)throw new Error(destinationError);
  const now=new Date().toISOString(),moved={...allocation,roomId:destinationId,updatedAt:now};
  const next={...data,updatedAt:now,allocations:data.allocations.map(a=>a.id===allocation.id?moved:a),history:[...data.history,createHistoryEvent(data,'allocation-moved',[{...source,allocation},destination],[{...source,allocation:undefined},{...destination,allocation:moved}],{destinationRoomId:destinationId})]};
  return normalizeData(next);
}
function allocationSignature(a?:Allocation){return JSON.stringify(a?[a.id,a.group,a.labelId||'',a.names,a.unnamed,a.arrived,a.checkedIn,a.contact,a.notes,a.checkIn,a.checkOut,!!a.headcountPending,a.updatedAt]:null);}
function recoveryCandidate(data:Dataset,event:HistoryEntry):Dataset {
  const original=event.before?.[0]?.allocation;
  if(!original?.id||!original.checkIn||!original.checkOut)throw new Error('This older event has no stay dates and is for reference only.');
  const existing=data.allocations.find(a=>a.id===original.id);
  if(!existing)throw new Error('The original stay is unavailable.');
  const now=new Date().toISOString(),restored:StayAllocation={...existing,...original,id:existing.id,roomId:event.roomId!,checkIn:original.checkIn,checkOut:original.checkOut,lifecycle:'active',headcountPending:!!original.headcountPending,actualCheckIn:original.actualCheckIn,actualCheckOut:original.actualCheckOut,updatedAt:now};
  const error=roomStayError(data,restored.roomId,restored,restored.id);if(error)throw new Error(error);
  return normalizeData({...data,updatedAt:now,allocations:data.allocations.map(a=>a.id===restored.id?restored:a)});
}
export function recoveryReason(data:Dataset,event:HistoryEntry):string|null {
  if(!['checked-in','allocation-cancelled','checked-out'].includes(event.action))return 'This event is for reference only.';
  if(!event.before?.length||!event.after?.length||!event.roomId)return 'This older event does not contain the details needed for recovery.';
  const latest=[...data.history].reverse().find(e=>e.roomId===event.roomId||e.destinationRoomId===event.roomId);
  if(latest?.id!==event.id)return 'A newer action has affected this room.';
  const current=data.allocations.find(a=>a.id===event.allocationId&&a.lifecycle==='active');
  if(allocationSignature(current)!==allocationSignature(event.after[0].allocation))return 'The allocation has changed since this action.';
  try{recoveryCandidate(data,event);return null;}catch(e){return e instanceof Error?e.message:'Recovery is unavailable.';}
}
export function recoverAction(data:Dataset,eventId:string):Dataset {
  const event=data.history.find(e=>e.id===eventId);if(!event)throw new Error('History event not found.');
  const reason=recoveryReason(data,event);if(reason)throw new Error(reason);
  const next=recoveryCandidate(data,event),room=data.rooms.find(r=>r.id===event.roomId)!,before={...room,allocation:data.allocations.find(a=>a.id===event.allocationId&&a.lifecycle==='active')},after={...room,allocation:next.allocations.find(a=>a.id===event.allocationId&&a.lifecycle==='active')};
  return {...next,history:[...data.history,createHistoryEvent(data,'action-recovered',[before],[after],{recoveredEventId:event.id})]};
}
export function filterRooms(rooms:Room[],labels:AllocationLabel[],filters:{area?:string;property?:string;guest?:string;status?:string;type?:string;query?:string;label?:string},guests:Dataset['guests']=[]):Room[] {
  const query=(filters.query||'').trim().toLowerCase();
  return rooms.filter(room=>{
    const stays=roomAssignments(room);
    return (!filters.guest||stays.some(a=>a.guestGroupId===filters.guest))&&(!filters.property||room.propertyId===filters.property)&&(!filters.status||room.booked!==false||room.overdue)&&(!filters.area||room.areaId===filters.area)&&(!filters.status||statusOf(room)===filters.status)&&(!filters.type||room.type===filters.type)&&(!filters.label||(filters.status==='Available'?!stays.length:stays.some(a=>a.labelId===filters.label)))&&[room.number,...stays.flatMap(a=>[a.group,labels.find(l=>l.id===a.labelId)?.name||'',...a.names,...guests.filter(g=>g.id===a.guestGroupId).flatMap(g=>[g.name,...g.members])])].some(value=>value.toLowerCase().includes(query));
  }).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
}
