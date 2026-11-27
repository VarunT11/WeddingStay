import { normalizeData, validateData, storedData, MigrationRequired, type Dataset, type LegacyDataset } from './data.ts';

type JsonObject=Record<string,unknown>;
function object(value:unknown,where:string):JsonObject {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${where} must be an object.`);
 return value as JsonObject;
}
function text(value:unknown,where:string,nonempty=false):void {
 if(typeof value!=='string'||(nonempty&&!value.trim()))throw new Error(`${where} must be ${nonempty?'nonempty ':''}text.`);
}
function timestamp(value:unknown,where:string,optional=false):void {
 if(value===undefined&&optional)return;
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error(`${where} must be a valid timestamp.`);
}
function optionalText(value:unknown,where:string):void {if(value!==undefined)text(value,where);}
function allocation(value:unknown,where:string):void {
 const a=object(value,where);
 for(const key of ['group','contact','notes'])text(a[key],`${where}.${key}`);
 for(const key of ['id','labelId','guestGroupId'])optionalText(a[key],`${where}.${key}`);
 if(!Array.isArray(a.names)||!a.names.every(n=>typeof n==='string'&&n.trim()))throw new Error(`${where} contains invalid occupant names.`);
 if(!Number.isInteger(a.unnamed)||Number(a.unnamed)<0||!Number.isInteger(a.arrived)||Number(a.arrived)<0||typeof a.checkedIn!=='boolean')throw new Error(`${where} has invalid occupant or arrival counts.`);
 const total=a.names.length+Number(a.unnamed);
 if((total<1&&!a.headcountPending)||Number(a.arrived)>total||a.checkedIn!==(Number(a.arrived)>0))throw new Error(`${where} has inconsistent arrival information.`);
 timestamp(a.createdAt,`${where}.createdAt`,true);timestamp(a.updatedAt,`${where}.updatedAt`,true);
 timestamp(a.actualCheckIn,`${where}.actualCheckIn`,true);timestamp(a.actualCheckOut,`${where}.actualCheckOut`,true);
}
function area(value:unknown):void {
 const a=object(value,'Area');text(a.id,'Area ID',true);text(a.name,'Area name',true);text(a.description,'Area description');text(a.motif,'Area appearance');
 timestamp(a.createdAt,'Area creation time',true);timestamp(a.updatedAt,'Area update time',true);
}
function room(value:unknown):void {
 const r=object(value,'Room');text(r.id,'Room ID',true);text(r.number,'Room number',true);text(r.areaId,'Room area',true);
 if(!['Normal','Suite'].includes(String(r.type))||!Number.isInteger(r.capacity)||Number(r.capacity)<1)throw new Error('Room type or capacity is invalid.');
 optionalText(r.notes,'Room notes');
 if(r.special!==undefined&&(r.type!=='Suite'||!['Bride Suite','Groom Suite'].includes(String(r.special))))throw new Error('Invalid special suite designation.');
 if(r.allocation!==undefined){allocation(r.allocation,'Allocation');const a=r.allocation as JsonObject;if((a.names as unknown[]).length+Number(a.unnamed)>Number(r.capacity))throw new Error('An allocation exceeds its room capacity.');}
 timestamp(r.createdAt,'Room creation time',true);timestamp(r.updatedAt,'Room update time',true);
}
function history(value:unknown):void {
 const h=object(value,'History event');text(h.id,'History event ID',true);text(h.action,'History action',true);timestamp(h.at,'History event time');
 for(const key of ['roomId','destinationRoomId','areaId','allocationId','recoveredEventId'])optionalText(h[key],`History ${key}`);
 for(const key of ['roomSnapshot','destinationSnapshot'])if(h[key]!==undefined)room(h[key]);
 if(h.areaSnapshot!==undefined)area(h.areaSnapshot);
 for(const key of ['before','after'])if(h[key]!==undefined){if(!Array.isArray(h[key]))throw new Error('History snapshots must be lists.');(h[key] as unknown[]).forEach(room);}
 for(const key of ['roomNames','areaNames','labelNames'])if(h[key]!==undefined){const names=object(h[key],key);Object.values(names).forEach(name=>text(name,key));}
 if(h.before!==undefined||h.after!==undefined){
  if(!Array.isArray(h.before)||!Array.isArray(h.after)||h.before.length!==h.after.length||!h.before.length)throw new Error('History before/after snapshots do not match.');
  const before=h.before as JsonObject[],after=h.after as JsonObject[];
  if(before[0].id!==h.roomId||before.some((r,i)=>r.id!==after[i].id))throw new Error('History room references do not match their snapshots.');
  if(['checked-in','allocation-cancelled','checked-out'].includes(String(h.action))){
   if(before.length!==1)throw new Error('Invalid recovery event snapshots.');
   const original=before[0].allocation as JsonObject|undefined,result=after[0].allocation as JsonObject|undefined;
   if(!original||(h.action==='checked-in'?original.checkedIn!==false||result?.checkedIn!==true||original.id!==result.id:result!==undefined||original.checkedIn!==(h.action==='checked-out')))throw new Error('History action conflicts with its allocation state.');
  }
 }
}

export function parseDataset(contents:string):Dataset {
 let raw:unknown;try{raw=JSON.parse(contents);}catch{throw new Error('This file is not valid JSON. Select a WeddingStay data export.');}
 const data=object(raw,'Data file');
 if(data.version===3){
  if(data.roomAvailability!==undefined&&!Array.isArray(data.roomAvailability))throw new Error('Room availability must be a list.');if(data.attendance!==undefined&&!Array.isArray(data.attendance))throw new Error('Attendance must be a list.');if(data.guestCategories!==undefined&&!Array.isArray(data.guestCategories))throw new Error('Guest categories must be a list.');
  for(const key of ['areas','rooms','history','labels','guests','events','invitations','properties','allocations','requirements'])if(!Array.isArray(data[key]))throw new Error(`The data file is missing its ${key} list.`);
  (data.areas as unknown[]).forEach(area);(data.rooms as unknown[]).forEach(room);(data.history as unknown[]).forEach(history);
  (data.allocations as unknown[]).forEach((a,i)=>allocation(a,`Allocation ${i+1}`));
  timestamp(data.createdAt,'Dataset creation time');timestamp(data.updatedAt,'Dataset update time');timestamp(data.exportedAt,'Export time',true);
  for(const key of ['guests','events','invitations','properties','requirements','labels'])for(const record of data[key] as unknown[]){const r=object(record,key);timestamp(r.createdAt,`${key} creation time`,true);timestamp(r.updatedAt,`${key} update time`,true);}
  return normalizeData(storedData(data as unknown as Dataset) as Dataset);
 }
 if(data.version!==2)throw new Error('Unsupported data version. Select a WeddingStay version-3 or version-2 export.');
 for(const key of ['areas','rooms','history'])if(!Array.isArray(data[key]))throw new Error(`The data file is missing its ${key} list.`);
 if(data.labels!==undefined&&!Array.isArray(data.labels))throw new Error('The label list is invalid.');
 timestamp(data.createdAt,'Dataset creation time');timestamp(data.updatedAt,'Dataset update time');timestamp(data.exportedAt,'Export time',true);
 (data.areas as unknown[]).forEach(area);(data.rooms as unknown[]).forEach(room);(data.history as unknown[]).forEach(history);
 ((data.labels||[]) as unknown[]).forEach(value=>{const label=object(value,'Label');text(label.id,'Label ID',true);text(label.name,'Label name',true);timestamp(label.createdAt,'Label creation time');timestamp(label.updatedAt,'Label update time');});
 const eventIds=new Set<string>();for(const event of data.history as JsonObject[]){if(eventIds.has(event.id as string))throw new Error('History event IDs must be unique.');eventIds.add(event.id as string);}
 throw new MigrationRequired({version:2,areas:data.areas,rooms:data.rooms,labels:data.labels||[],history:data.history,createdAt:data.createdAt,updatedAt:data.updatedAt} as LegacyDataset);
}
export function serializeDataset(data:Dataset):string {validateData(data);return JSON.stringify({...storedData(data),exportedAt:new Date().toISOString()},null,2);}
export function transferPreview(data:Dataset) {
 const ranges=data.properties.flatMap(p=>p.bookedRanges),dates=ranges.flatMap(r=>[r.checkIn,r.checkOut]).sort();
 return {from:dates[0],until:dates.at(-1),properties:data.properties.map(p=>({name:p.name,ranges:p.bookedRanges})),active:data.allocations.filter(a=>a.lifecycle==='active').length,completed:data.allocations.filter(a=>a.lifecycle==='completed').length,cancelled:data.allocations.filter(a=>a.lifecycle==='cancelled').length};
}
export function exportFilename():string {const now=new Date();const pad=(n:number)=>String(n).padStart(2,'0');return `weddingstay-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;}
