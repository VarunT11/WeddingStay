import {firstUnavailableNight,isDate,nextDay,normalizeData,propertyBookedOn,propertyForRoom,type Dataset,type DateRange,type RoomAvailability} from './data';

export function propertyNights(data:Dataset,propertyId:string){const nights=new Set<string>();for(const range of data.properties.find(p=>p.id===propertyId)?.bookedRanges||[])for(let date=range.checkIn;date<range.checkOut;date=nextDay(date))nights.add(date);return [...nights].sort();}
export function availabilityRecord(data:Dataset,propertyId:string,date:string){return data.roomAvailability.find(r=>r.propertyId===propertyId&&r.date===date);}
export type AvailabilitySelection={mode:RoomAvailability['mode'];roomIds:string[]};
export function availabilityChanges(data:Dataset,propertyId:string,dates:string[],selection:AvailabilitySelection,uid:string):Dataset{
 if(!uid||!dates.length||new Set(dates).size!==dates.length||dates.some(date=>!isDate(date)||!propertyBookedOn(data,propertyId,date)))throw new Error('Choose booked nights for this property.');
 if(selection.mode==='selected'&&!selection.roomIds.length)throw new Error('Select at least one room, or choose No rooms.');
 const now=new Date().toISOString(),roomIds=selection.mode==='selected'?[...selection.roomIds].sort():[];
 const records=dates.map(date=>{const old=availabilityRecord(data,propertyId,date);return {id:old?.id||'availability-'+encodeURIComponent(propertyId)+':'+date,propertyId,date,mode:selection.mode,roomIds,createdAt:old?.createdAt||now,createdBy:old?.createdBy||uid,updatedAt:now,updatedBy:uid};});
 return {...data,roomAvailability:[...data.roomAvailability.filter(r=>r.propertyId!==propertyId||!dates.includes(r.date)),...records]};
}
export function availabilityConflicts(data:Dataset,next:Dataset,propertyId:string){return data.allocations.filter(stay=>stay.lifecycle==='active'&&propertyForRoom(data,data.rooms.find(room=>room.id===stay.roomId)!)?.id===propertyId).flatMap(stay=>{const room=next.rooms.find(r=>r.id===stay.roomId);const night=room&&firstUnavailableNight(next,room,stay);return night?[{stay,night,room:room!}]:[];});}
export function saveRoomAvailability(data:Dataset,propertyId:string,dates:string[],selection:AvailabilitySelection,uid:string){return normalizeData(availabilityChanges(data,propertyId,dates,selection,uid));}
export function cleanRoomAvailability(data:Dataset,uid:string):Dataset{
 const now=new Date().toISOString();
 return {...data,roomAvailability:data.roomAvailability.map(value=>{const roomIds=value.roomIds.filter(id=>{const room=data.rooms.find(r=>r.id===id);return room&&propertyForRoom(data,room)?.id===value.propertyId;});return roomIds.length===value.roomIds.length?value:{...value,roomIds,mode:value.mode==='selected'&&!roomIds.length?'none' as const:value.mode,updatedAt:now,updatedBy:uid};})};
}
export function availabilityNights(range:DateRange){if(!isDate(range.checkIn)||!isDate(range.checkOut)||range.checkIn>=range.checkOut)throw new Error('Choose valid dates with checkout after the first night.');const result:string[]=[];for(let date=range.checkIn;date<range.checkOut;date=nextDay(date))result.push(date);return result;}
