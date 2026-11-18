import {allocationsOn,countOf,roomSpace,roomStayError,type Allocation,type Dataset,type DateRange,type Room} from './data';
import {stayDates} from './StayUI';
import './room-sharing.css';

export function guestRoomCoverage(data:Dataset,guestId:string){
 const stays=data.allocations.filter(a=>a.guestGroupId===guestId&&a.lifecycle==='active');
 const points=[...new Set(stays.flatMap(a=>[a.checkIn,a.checkOut]))].sort();
 return points.slice(0,-1).map((date,index)=>{const current=stays.filter(a=>a.checkIn<=date&&date<a.checkOut);return {checkIn:date,checkOut:points[index+1],rooms:new Set(current.map(a=>a.roomId)).size,assigned:current.reduce((n,a)=>n+countOf(a),0),unknown:current.some(a=>a.headcountPending)};}).filter(segment=>segment.rooms>0);
}
export function RoomSharingSummary({data,room,selectedId,onSelect,onAdd,draft}:{data:Dataset;room:Room;selectedId?:string;onSelect:(id:string,action?:string)=>void;onAdd:()=>void;draft?:Allocation&DateRange}){
 const stays=allocationsOn(data,room.id),space=roomSpace(data,room.id,draft||{checkIn:data.viewDate||data.wedding.defaultDate,checkOut:new Date(Date.parse(data.viewDate||data.wedding.defaultDate)+86400000).toISOString().slice(0,10)},draft?selectedId:undefined);
 const overlapping=draft?space.others:stays;
 const linked=draft?.guestGroupId?data.guests.find(g=>g.id===draft.guestGroupId):undefined;
 const excess=linked&&linked.headcount!==null&&draft?guestRoomCoverage({...data,allocations:[...data.allocations.filter(a=>a.id!==selectedId),{...draft,id:'draft-preview',roomId:room.id,lifecycle:'active',headcountPending:!!draft.headcountPending}]},linked.id).some(segment=>segment.checkIn<draft.checkOut&&draft.checkIn<segment.checkOut&&segment.assigned>linked.headcount!):false;
 if(!stays.length&&!overlapping.length&&!excess)return null;
 return <section className="room-sharing-summary" aria-label="Groups in this room"><header><h3>{stays.length>1?'Shared room · '+stays.length+' groups':'Room occupants'}</h3>{!draft&&<button type="button" className="text-link" disabled={!!space.overdue.length||stays.some(a=>a.headcountPending)||space.remaining<1} onClick={onAdd}>Add another group</button>}</header>
  {(draft?overlapping:stays).map(stay=><div className={'room-sharing-group'+(stay.id===selectedId?' selected':'')} key={stay.id}><div><strong>{stay.group||data.guests.find(g=>g.id===stay.guestGroupId)?.name||'Guest stay'}</strong><small>{stayDates(stay.checkIn,stay.checkOut)}</small><small>{stay.headcountPending?'Count needed':countOf(stay)+' assigned · '+stay.arrived+' arrived'} · {stay.checkedIn?'Checked in':'Reserved'}</small></div>{!draft&&<div className="sharing-group-actions"><button type="button" className="button secondary" aria-pressed={stay.id===selectedId} onClick={()=>onSelect(stay.id)}>{stay.id===selectedId?'Selected':'View stay'}</button><details><summary className="text-link">Actions</summary><div><button type="button" onClick={()=>onSelect(stay.id,'edit')}>Edit stay</button><button type="button" onClick={()=>onSelect(stay.id,stay.headcountPending?'edit':'arrivals')}>Arrivals</button><button type="button" onClick={()=>onSelect(stay.id,'move')}>Move room</button><button type="button" onClick={()=>onSelect(stay.id,'release')}>{stay.checkedIn?'Check out':'Cancel stay'}</button></div></details></div>}</div>)}
  {draft&&overlapping.length>0&&<p>{space.remaining} spaces remain across these dates. Enter the count for this group; the shared room will be reviewed before saving.</p>}
  {!draft&&stays.some(a=>a.headcountPending)&&<p>Add the existing guest count before sharing this room.</p>}
  {excess&&<p className="stay-warning" role="status">Known room assignments exceed this group’s recorded expected count on at least one night. Review the split; expected guests may differ from actual stay needs.</p>}
 </section>;
}
