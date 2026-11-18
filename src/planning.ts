import {roomSpace,changeAllocation,isDate,nextDay,normalizeData,overlaps,propertyForRoom,type Dataset,type DateRange,type Room,type RoomRequirement} from './data';

export function requirementMatches(data:Dataset,r:RoomRequirement,a:Dataset['allocations'][number]) {
 const room=data.rooms.find(room=>room.id===a.roomId);
 return a.lifecycle!=='cancelled'&&a.labelId===r.labelId&&(!r.guestGroupId||r.guestGroupId===a.guestGroupId)&&(!r.propertyId||r.propertyId===(room&&propertyForRoom(data,room)?.id));
}
function effectiveCheckout(a:Dataset['allocations'][number]) {
 if(a.lifecycle!=='completed'||!a.actualCheckOut)return a.checkOut;
 const d=new Date(a.actualCheckOut);
 const actual=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 return actual<a.checkOut?actual:a.checkOut;
}
export function requirementNight(data:Dataset,r:RoomRequirement,date:string) {
 const allocations=data.allocations.filter(a=>requirementMatches(data,r,a)&&a.checkIn<=date&&date<effectiveCheckout(a));
 const allocated=new Set(allocations.map(a=>a.roomId)).size;
 return {date,allocated,remaining:Math.max(0,r.roomsRequired-allocated),excess:Math.max(0,allocated-r.roomsRequired),allocations};
}
export function requirementProgress(data:Dataset,r:RoomRequirement) {
 const nights=[];
 for(let date=r.checkIn;date<r.checkOut;date=nextDay(date))nights.push(requirementNight(data,r,date));
 const least=nights.reduce((a,b)=>a.allocated<=b.allocated?a:b);
 const date=data.viewDate||data.wedding.defaultDate;
 return {nights,least,selected:r.checkIn<=date&&date<r.checkOut?requirementNight(data,r,date):null};
}
export function saveRequirement(data:Dataset,r:RoomRequirement):Dataset {
 const now=new Date().toISOString(),previous=data.requirements.find(x=>x.id===r.id),next={...r,createdAt:previous?.createdAt||now,updatedAt:now};
 return normalizeData({...data,requirements:previous?data.requirements.map(x=>x.id===r.id?next:x):[...data.requirements,next]});
}
export function deleteRequirement(data:Dataset,id:string):Dataset {return normalizeData({...data,requirements:data.requirements.filter(r=>r.id!==id)});}
export type BulkDraft=DateRange&{labelId?:string;guestGroupId?:string;propertyId?:string;group:string;contact:string;notes:string;counts?:Record<string,number>;includeShared?:boolean};
export function bulkRoomAvailable(data:Dataset,room:Room,dates:DateRange,count?:number,guestId?:string) {
 const space=roomSpace(data,room.id,dates);
 return space.booked&&!space.overdue.length&&!space.unknown&&(!space.others.length||(count!==undefined&&Number.isInteger(count)&&count>0&&count<=space.remaining&&!space.others.some(a=>guestId&&a.guestGroupId===guestId)));
}
export function bulkAllocate(data:Dataset,draft:BulkDraft,roomIds:string[]):Dataset {
 if(!isDate(draft.checkIn)||!isDate(draft.checkOut)||draft.checkIn>=draft.checkOut)throw new Error('Choose valid stay dates with checkout after check-in.');
 if(!draft.group.trim()&&!draft.guestGroupId)throw new Error('Enter a group name or choose a guest group.');
 if(!roomIds.length||new Set(roomIds).size!==roomIds.length)throw new Error('Select one or more distinct rooms.');
 for(const id of roomIds){const room=data.rooms.find(r=>r.id===id);if(!room||!bulkRoomAvailable(data,room,draft,draft.includeShared?draft.counts?.[id]:undefined,draft.guestGroupId)||(draft.propertyId&&propertyForRoom(data,room)?.id!==draft.propertyId))throw new Error('A selected room is no longer available for this stay. Review your selection.');}
 for(const id of roomIds)if(draft.counts&&(!Number.isInteger(draft.counts[id])||draft.counts[id]<1))throw new Error('Enter a guest count of at least one for every selected room.');
 let next=data;
 for(const roomId of roomIds)next=changeAllocation(next,roomId,{id:crypto.randomUUID(),group:draft.group.trim(),guestGroupId:draft.guestGroupId,labelId:draft.labelId,checkIn:draft.checkIn,checkOut:draft.checkOut,contact:draft.contact.trim(),notes:draft.notes.trim(),headcountPending:!draft.counts,names:[],unnamed:draft.counts?.[roomId]||0,arrived:0,checkedIn:false});
 return next;
}
export function operationsForDate(data:Dataset) {
 const date=data.viewDate||data.wedding.defaultDate;
 const scheduled=data.allocations.filter(a=>a.lifecycle!=='cancelled');
 return {events:data.events.filter(e=>e.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||'')),arrivals:scheduled.filter(a=>a.checkIn===date),departures:scheduled.filter(a=>a.checkOut===date),awaiting:scheduled.filter(a=>a.lifecycle==='active'&&a.checkIn===date&&!a.checkedIn),requirements:data.requirements.filter(r=>r.checkIn<=date&&date<r.checkOut).map(r=>({requirement:r,...requirementNight(data,r,date)})).filter(r=>r.remaining>0)};
}
