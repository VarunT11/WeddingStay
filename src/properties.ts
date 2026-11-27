import {normalizeData,isDate,overlaps,type Dataset,type StayProperty} from './data';
export function saveProperty(data:Dataset,property:StayProperty):Dataset {
 if(!property.name.trim())throw new Error('Enter a property name.');
 if(!property.bookedRanges.length)throw new Error('Add at least one booked date range.');
 for(const r of property.bookedRanges)if(!isDate(r.checkIn)||!isDate(r.checkOut)||r.checkIn>=r.checkOut)throw new Error('Each booking needs valid dates with checkout after check-in.');
 const bookedRanges:StayProperty['bookedRanges']=[];
 for(const r of [...property.bookedRanges].sort((a,b)=>a.checkIn.localeCompare(b.checkIn))){const last=bookedRanges.at(-1);if(last&&(overlaps(last,r)||last.checkOut===r.checkIn))last.checkOut=last.checkOut>r.checkOut?last.checkOut:r.checkOut;else bookedRanges.push({...r});}
 const now=new Date().toISOString(),existing=data.properties.find(p=>p.id===property.id),next={...property,name:property.name.trim(),address:property.address.trim(),contactName:property.contactName?.trim(),contactPhone:property.contactPhone?.trim(),notes:property.notes.trim(),bookedRanges,createdAt:existing?.createdAt||now,updatedAt:now};
 return normalizeData({...data,roomAvailability:data.roomAvailability.filter(r=>r.propertyId!==property.id||bookedRanges.some(range=>range.checkIn<=r.date&&r.date<range.checkOut)),properties:existing?data.properties.map(p=>p.id===next.id?next:p):[...data.properties,next]});
}
export function propertyReferences(data:Dataset,id:string) {
 const areaIds=new Set(data.areas.filter(a=>a.propertyId===id).map(a=>a.id)),roomIds=new Set(data.rooms.filter(r=>areaIds.has(r.areaId)).map(r=>r.id));
 return areaIds.size>0||roomIds.size>0||data.allocations.some(a=>roomIds.has(a.roomId))||data.requirements.some(r=>r.propertyId===id);
}
export function deleteProperty(data:Dataset,id:string):Dataset {
 if(propertyReferences(data,id))throw new Error('This property has areas, rooms, saved stays or room requirements. Keep it and edit its details instead.');
 return normalizeData({...data,properties:data.properties.filter(p=>p.id!==id),roomAvailability:data.roomAvailability.filter(r=>r.propertyId!==id)});
}
