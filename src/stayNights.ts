import {localToday,nextDay,overdueStays,projectData,summary,type Dataset,type DateRange} from './data';
import {requirementNight} from './planning';
export function stayNight(data:Dataset,date:string) {
 const view=projectData(data,date),properties=view.properties.filter(p=>p.bookedRanges.some(r=>r.checkIn<=date&&date<r.checkOut));
 const rooms=view.rooms.filter(r=>r.booked),requirements=view.requirements.filter(r=>r.checkIn<=date&&date<r.checkOut).map(r=>({requirement:r,...requirementNight(view,r,date)}));
 return {date,view,properties,rooms,totals:summary(rooms),requirements,remaining:requirements.reduce((s,r)=>s+r.remaining,0),inventoryPending:properties.filter(p=>!rooms.some(r=>r.propertyId===p.id)).length,overdue:date===localToday()?overdueStays(view):[]};
}
export function plannedNightDates(data:Dataset) {
 const dates=new Set<string>();
 const add=(range:DateRange)=>{for(let date=range.checkIn;date<range.checkOut;date=nextDay(date))dates.add(date);};
 data.properties.forEach(p=>p.bookedRanges.forEach(add));data.requirements.forEach(add);data.allocations.filter(a=>a.lifecycle==='active').forEach(add);
 if(overdueStays(data).length)dates.add(localToday());
 return [...dates].sort();
}
export function stayNights(data:Dataset) {
 return plannedNightDates(data).map(date=>stayNight(data,date));
}
