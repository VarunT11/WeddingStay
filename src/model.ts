export type Status = 'Available' | 'Allotted' | 'Occupied';
type Timestamps = { createdAt?: string; updatedAt?: string };
export type WeddingSettings = { name: string; defaultDate: string };
export type GuestCategory = Timestamps & {id:string;name:string};
export type GuestGroup = Timestamps & { id: string; name: string; members: string[]; headcount: number | null; category: string; categoryId?:string; contact: string; needsAccommodation: boolean | null; notes: string };
export type EventLifecycle='Upcoming'|'In progress'|'Completed';
export type WeddingEvent = Timestamps & { id: string; name: string; date: string; time?: string; location: string; notes: string; lifecycle?:EventLifecycle; lifecycleChangedAt?:string; lifecycleChangedBy?:string };
export type EventAttendance = Timestamps & {id:string;eventId:string;guestGroupId:string;status:'Not recorded'|'Attended'|'Did not attend';actualHeadcount:number|null;source:'invited'|'added-at-event';notes:string;updatedBy:string};
export type Invitation = Timestamps & { id: string; guestGroupId: string; eventId: string; response: 'Pending' | 'Confirmed' | 'Declined'; confirmedHeadcount: number | null };
export type RoomAvailability = Timestamps & {id:string;propertyId:string;date:string;mode:'all'|'selected'|'none';roomIds:string[];createdBy:string;updatedBy:string};
export type DateRange = { checkIn: string; checkOut: string };
export type StayProperty = Timestamps & { id: string; name: string; address: string; contactName?:string; contactPhone?:string; notes: string; bookedRanges: DateRange[] };
export type Area = Timestamps & { id: string; propertyId: string; name: string; description: string; motif: string };
export type AllocationLabel = { id: string; name: string; createdAt: string; updatedAt: string };
// Optional scheduling fields keep old history snapshots readable without inventing dates.
export type Allocation = Timestamps & { id?: string; group: string; labelId?: string; guestGroupId?: string; names: string[]; unnamed: number; arrived: number; contact: string; notes: string; checkedIn: boolean; headcountPending?: boolean; checkIn?: string; checkOut?: string; lifecycle?: 'active' | 'completed' | 'cancelled'; actualCheckIn?: string; actualCheckOut?: string };
export type StayAllocation = Allocation & DateRange & { id: string; roomId: string; lifecycle: 'active' | 'completed' | 'cancelled'; headcountPending: boolean };
// allocation is a derived view for existing screens; it is never stored on inventory rooms.
export type Room = Timestamps & { id: string; number: string; areaId: string; type: 'Normal' | 'Suite'; capacity: number; special?: string; notes?: string; allocation?: Allocation; stays?:StayAllocation[]; booked?:boolean; overdue?:boolean; propertyId?:string; availabilityReason?:'property-not-booked'|'room-unavailable'; occupancyException?:boolean };
export type HistoryEntry = { id: string; at: string; action: string; roomId?: string; destinationRoomId?: string; areaId?: string; roomSnapshot?: Room; destinationSnapshot?: Room; areaSnapshot?: Area; before?: Room[]; after?: Room[]; roomNames?: Record<string,string>; areaNames?: Record<string,string>; labelNames?: Record<string,string>; allocationId?: string; recoveredEventId?: string };
export type RoomRequirement = DateRange & Timestamps & { id: string; labelId: string; roomsRequired: number; propertyId?: string; guestGroupId?: string };
export type Dataset = { version: 3; wedding: WeddingSettings; guests: GuestGroup[]; guestCategories:GuestCategory[]; events: WeddingEvent[]; invitations: Invitation[]; attendance:EventAttendance[]; roomAvailability:RoomAvailability[]; properties: StayProperty[]; areas: Area[]; rooms: Room[]; allocations: StayAllocation[]; requirements: RoomRequirement[]; labels: AllocationLabel[]; history: HistoryEntry[]; referenceData: boolean; createdAt: string; updatedAt: string; viewDate?:string };
export type LegacyDataset = { version: 2; areas: Omit<Area,'propertyId'>[]; rooms: Room[]; labels: AllocationLabel[]; history: HistoryEntry[]; createdAt: string; updatedAt: string };
export type MigrationSettings = { propertyName: string; bookedCheckIn: string; bookedCheckOut: string; checkIn: string; checkOut: string; defaultDate: string };
export const STORAGE_KEY = 'weddingstay.data.v3';
export const LEGACY_STORAGE_KEY = 'weddingstay.data.v2';
export const isDate = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export const overlaps = (a: DateRange,b: DateRange) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;
export const localToday = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const nextDay = (date:string,offset=1) => new Date(Date.parse(date)+offset*86400000).toISOString().slice(0,10);
export const overdueStays = (data:Dataset,roomId?:string) => data.allocations.filter(a=>a.lifecycle==='active'&&a.checkedIn&&a.checkOut<=localToday()&&(!roomId||a.roomId===roomId));
export const countOf = (a?: Allocation) => a && !a.headcountPending ? a.names.length + a.unnamed : 0;
export const statusOf = (r: Room): Status => !r.allocation ? 'Available' : r.allocation.checkedIn ? 'Occupied' : 'Allotted';
export function propertyForRoom(data: Dataset,room: Room) { return data.properties.find(p=>p.id===data.areas.find(a=>a.id===room.areaId)?.propertyId); }
export function allocationOn(data: Dataset,roomId: string,date=data.viewDate||data.wedding.defaultDate) {
  return allocationsOn(data,roomId,date)[0];
}
export function allocationsOn(data:Dataset,roomId:string,date=data.viewDate||data.wedding.defaultDate){
 return data.allocations.filter(a=>a.roomId===roomId&&a.lifecycle==='active'&&((a.checkIn<=date&&date<a.checkOut)||(date===localToday()&&a.checkedIn))).sort((a,b)=>Number(b.checkedIn)-Number(a.checkedIn)||a.checkIn.localeCompare(b.checkIn)||a.id.localeCompare(b.id));
}
export function roomAssignments(room:Room):Allocation[]{return room.stays|| (room.allocation?[room.allocation]:[]);}
export function roomOccupancy(room:Room){const stays=roomAssignments(room);return {assigned:stays.reduce((n,a)=>n+countOf(a),0),arrived:stays.reduce((n,a)=>n+a.arrived,0),unknown:stays.filter(a=>a.headcountPending).length,groups:stays.length};}
export function combinedAllocation(stays:StayAllocation[]):Allocation|undefined{
 if(stays.length<2)return stays[0];
 return {group:stays.map(a=>a.group).filter(Boolean).join(' + '),names:stays.flatMap(a=>a.names),unnamed:stays.reduce((n,a)=>n+a.unnamed,0),arrived:stays.reduce((n,a)=>n+a.arrived,0),checkedIn:stays.some(a=>a.checkedIn),headcountPending:stays.some(a=>a.headcountPending),labelId:stays.every(a=>a.labelId===stays[0].labelId)?stays[0].labelId:undefined,contact:stays.map(a=>a.contact).filter(Boolean).join(' / '),notes:stays.map(a=>a.group+': '+a.notes).filter((_,i)=>!!stays[i].notes).join('\n')};
}
export function propertyBookedOn(data:Dataset,propertyId:string,date:string){return !!data.properties.find(p=>p.id===propertyId)?.bookedRanges.some(r=>r.checkIn<=date&&date<r.checkOut);}
export function roomProvidedOn(data:Dataset,room:Room,date:string){const property=propertyForRoom(data,room);if(!property||!propertyBookedOn(data,property.id,date))return false;const rule=data.roomAvailability?.find(r=>r.propertyId===property.id&&r.date===date);return !rule||rule.mode==='all'||rule.mode==='selected'&&rule.roomIds.includes(room.id);}
export function firstUnavailableNight(data:Dataset,room:Room,dates:DateRange){if(!isDate(dates.checkIn)||!isDate(dates.checkOut)||dates.checkIn>=dates.checkOut)return dates.checkIn||'invalid date';for(let date=dates.checkIn;date<dates.checkOut;date=nextDay(date))if(!roomProvidedOn(data,room,date))return date;return undefined;}
export const visibleNightRoom=(room:Room)=>room.booked!==false||!!room.overdue||!!room.occupancyException;
export function roomSpace(data:Dataset,roomId:string,dates:DateRange,excludeId?:string){
 const room=data.rooms.find(r=>r.id===roomId),others=data.allocations.filter(a=>a.roomId===roomId&&a.id!==excludeId&&a.lifecycle==='active'&&overlaps(a,dates));
 const overdue=overdueStays(data,roomId).filter(a=>a.id!==excludeId);
 const points=[dates.checkIn,...others.map(a=>a.checkIn).filter(d=>dates.checkIn<d&&d<dates.checkOut)];
 const peak=Math.max(0,...points.map(date=>others.filter(a=>a.checkIn<=date&&date<a.checkOut).reduce((n,a)=>n+countOf(a),0)));
 const unknown=others.some(a=>a.headcountPending),blocked=unknown;
 const unavailableNight=room&&firstUnavailableNight(data,room,dates);
 return {others,peak,unknown,overdue,unavailableNight,remaining:blocked?0:Math.max(0,(room?.capacity||0)-peak),booked:!!room&&!unavailableNight};
}
export function roomStayError(data:Dataset,roomId:string,stay:Allocation&DateRange,excludeId?:string,checkOverdue=true){
 const space=roomSpace(data,roomId,stay,excludeId);
 const physicallyArrived=data.allocations.filter(a=>a.roomId===roomId&&a.id!==excludeId&&a.lifecycle==='active'&&a.checkedIn).reduce((n,a)=>n+a.arrived,0);
 if(stay.checkedIn&&physicallyArrived+stay.arrived>(data.rooms.find(r=>r.id===roomId)?.capacity||0))return 'Checked-in arrivals across all groups exceed room capacity. Resolve the other stay first.';
 if(!space.booked)return 'Room '+(data.rooms.find(r=>r.id===roomId)?.number||roomId)+' is unavailable on '+(space.unavailableNight||stay.checkIn)+'. The room must be available for every night of the stay.';
 if(checkOverdue&&space.overdue.length)return 'Resolve the overdue checked-in stay before assigning or checking in another group.';
 if(space.others.some(a=>stay.guestGroupId&&a.guestGroupId===stay.guestGroupId))return 'This group already has an overlapping stay in this room. Edit that stay instead.';
 if(space.unknown)return 'An overlapping reservation has an unknown guest count. Add its count before sharing this room.';
 if(stay.headcountPending&&space.others.length)return 'Enter a guest count before sharing this room.';
 if(!stay.headcountPending&&countOf(stay)>space.remaining)return 'Only '+space.remaining+' guest spaces remain across these dates.';
 return '';
}
export function projectData(data: Dataset,date=data.viewDate||data.wedding.defaultDate): Dataset {
  return {...data,viewDate:date,rooms:data.rooms.map(room=>{const stays=allocationsOn(data,room.id,date);return {...room,stays,allocation:combinedAllocation(stays.map(a=>({...a,group:a.group.trim()||data.guests.find(g=>g.id===a.guestGroupId)?.name||'Guest stay'}))),propertyId:propertyForRoom(data,room)?.id,booked:roomProvidedOn(data,room,date),availabilityReason:roomProvidedOn(data,room,date)?undefined:propertyBookedOn(data,propertyForRoom(data,room)?.id||'',date)?'room-unavailable':'property-not-booked',occupancyException:stays.some(a=>a.checkedIn)||(date===localToday()&&data.allocations.some(a=>a.roomId===room.id&&a.lifecycle==='active'&&a.checkedIn)),overdue:date===localToday()&&overdueStays(data,room.id).length>0};})};
}
export function withEventAttendance(data:Dataset):Dataset {return {...data,attendance:data.attendance===undefined?[]:data.attendance,roomAvailability:data.roomAvailability===undefined?[]:data.roomAvailability,events:data.events.map(event=>({...event,lifecycle:event.lifecycle??'Upcoming'}))};}
export function storedData(data: Dataset) { const {viewDate:_,...saved}=withEventAttendance(data);return {...saved,rooms:data.rooms.map(({allocation:_,stays:_s,booked:_b,overdue:_o,propertyId:_p,availabilityReason:_ar,occupancyException:_oe,...room})=>room)}; }
export function withGuestCategories(data:Dataset):Dataset {
 const categories=[...(data.guestCategories||[])];
 const guests=data.guests.map(guest=>{
  if(guest.categoryId){const category=categories.find(c=>c.id===guest.categoryId);return category?{...guest,category:category.name}:guest;}
  const name=guest.category?.trim();if(!name)return {...guest,category:''};
  let category=categories.find(c=>c.name.trim().toLowerCase()===name.toLowerCase());
  if(!category){category={id:'category-'+encodeURIComponent(name.toLowerCase()),name};categories.push(category);}
  return {...guest,categoryId:category.id,category:category.name};
 });
 return {...data,guests,guestCategories:categories};
}
export function emptyDataset(): Dataset {
  const now=new Date().toISOString();
  return {version:3,wedding:{name:'Your wedding',defaultDate:'2026-12-01'},guests:[],guestCategories:[],events:[],invitations:[],attendance:[],roomAvailability:[],properties:[],areas:[],rooms:[],allocations:[],requirements:[],labels:[],history:[],referenceData:false,createdAt:now,updatedAt:now};
}
export class MigrationRequired extends Error {
  constructor(public legacy: LegacyDataset) { super('Your saved data needs a one-time stay setup.'); }
}
export function migrateLegacy(legacy: LegacyDataset,settings: MigrationSettings): Dataset {
  const {propertyName,bookedCheckIn,bookedCheckOut,checkIn,checkOut,defaultDate}=settings;
  if(!propertyName.trim())throw new Error('Enter a property name.');
  if(![bookedCheckIn,bookedCheckOut,checkIn,checkOut,defaultDate].every(isDate))throw new Error('Enter valid dates.');
  if(bookedCheckIn>=bookedCheckOut||checkIn>=checkOut||checkIn<bookedCheckIn||checkOut>bookedCheckOut)throw new Error('Allocation dates must fit within the property booking.');
  if(defaultDate<checkIn||defaultDate>=checkOut)throw new Error('Choose a working date within the existing allocation stay.');
  const now=new Date().toISOString(),propertyId='legacy-property';
  const data:Dataset={...emptyDataset(),createdAt:legacy.createdAt,updatedAt:now,wedding:{name:'Your wedding',defaultDate},
    properties:[{id:propertyId,name:propertyName.trim(),address:'',notes:'',bookedRanges:[{checkIn:bookedCheckIn,checkOut:bookedCheckOut}],createdAt:now,updatedAt:now}],
    areas:legacy.areas.map(a=>({...a,propertyId})),rooms:legacy.rooms.map(({allocation:_,...r})=>r),labels:legacy.labels||[],history:legacy.history,
    allocations:legacy.rooms.flatMap(r=>r.allocation?[{...r.allocation,id:r.allocation.id||`legacy-${r.id}-${r.allocation.createdAt||'allocation'}`,roomId:r.id,checkIn,checkOut,lifecycle:'active' as const,headcountPending:false}]:[])};
  return projectData(data);
}
export function seed(): Dataset {
  const data=emptyDataset(),now=data.createdAt;
  data.referenceData=true;data.wedding={name:'Reference wedding',defaultDate:'2026-12-01'};
  data.properties=['Rosewood House','Meadow Retreat'].map((name,i)=>({id:`property-${i+1}`,name,address:'Fictional reference location',notes:'Reference data',bookedRanges:[{checkIn:'2026-11-30',checkOut:'2026-12-04'}],createdAt:now,updatedAt:now}));
  data.areas=data.properties.map((p,i)=>({id:`area-${i+1}`,propertyId:p.id,name:i?'Garden Wing':'Main Block',description:'Fictional reference area',motif:i?'garden':'main',createdAt:now,updatedAt:now}));
  data.rooms=data.areas.flatMap((a,i)=>Array.from({length:3},(_,j)=>({id:`room-${i+1}-${j+1}`,areaId:a.id,number:String(101+j),type:j===2?'Suite' as const:'Normal' as const,capacity:4,notes:'Reference room',createdAt:now,updatedAt:now})));
  data.guests=[{id:'guest-1',name:'Sharma family',members:['Amit Sharma','Neha Sharma'],headcount:5,category:'Family',contact:'',needsAccommodation:true,notes:''},{id:'guest-2',name:'College friends',members:[],headcount:null,category:'Friends',contact:'',needsAccommodation:true,notes:'Headcount to follow'},{id:'guest-3',name:'Mehta family',members:['Riya Mehta'],headcount:2,category:'Friends',contact:'',needsAccommodation:false,notes:''}].map(g=>({...g,createdAt:now,updatedAt:now}));
  data.events=[{id:'event-1',name:'Welcome evening',date:'2026-12-01',time:'18:00',location:'Rosewood lawn',notes:''},{id:'event-2',name:'Wedding ceremony',date:'2026-12-02',time:'19:00',location:'Meadow pavilion',notes:''}];
  data.invitations=[{id:'invite-1',guestGroupId:'guest-1',eventId:'event-1',response:'Confirmed',confirmedHeadcount:5},{id:'invite-2',guestGroupId:'guest-1',eventId:'event-2',response:'Confirmed',confirmedHeadcount:5},{id:'invite-3',guestGroupId:'guest-2',eventId:'event-2',response:'Pending',confirmedHeadcount:null},{id:'invite-4',guestGroupId:'guest-3',eventId:'event-1',response:'Declined',confirmedHeadcount:null}];
  data.labels=[{id:'label-family',name:'Family',createdAt:now,updatedAt:now}];
  const base={names:[] as string[],unnamed:0,arrived:0,contact:'',notes:'Reference allocation',checkedIn:false,lifecycle:'active' as const,headcountPending:false,checkIn:'2026-12-01',checkOut:'2026-12-03',createdAt:now,updatedAt:now};
  data.allocations=[{...base,id:'stay-1',roomId:'room-1-1',group:'Sharma family',guestGroupId:'guest-1',labelId:'label-family',names:['Amit Sharma','Neha Sharma'],unnamed:1,arrived:2,checkedIn:true,actualCheckIn:now},{...base,id:'stay-2',roomId:'room-1-2',group:'Sharma family',guestGroupId:'guest-1',labelId:'label-family',unnamed:2},{...base,id:'stay-3',roomId:'room-2-1',group:'College friends',guestGroupId:'guest-2',headcountPending:true},{...base,id:'stay-4',roomId:'room-1-1',group:'Later reference stay',unnamed:2,checkIn:'2026-12-03',checkOut:'2026-12-04'}];
  data.requirements=[{id:'requirement-1',labelId:'label-family',guestGroupId:'guest-1',propertyId:'property-1',checkIn:'2026-12-01',checkOut:'2026-12-03',roomsRequired:3}];
  return projectData(data);
}
