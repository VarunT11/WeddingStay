import {roomOccupancy} from './data';
import {WeddingArt,WeddingFlower} from './WeddingArt';
import {stayDates} from './StayUI';
import {ArrowRight,CalendarDays,LogIn,LogOut,Users} from 'lucide-react';
import {countOf,overdueStays,propertyForRoom,type Dataset,type StayAllocation,type WeddingEvent} from './data';
import {operationsForDate} from './planning';
import {invitationSummary} from './management';
import {Link} from './navigation';
import {allocationPath,roomsPath} from './stayRoutes';

export function EventCards({data,events,variant='default'}:{data:Dataset;events:WeddingEvent[];variant?:'default'|'dashboard'}) {
 if(variant==='dashboard')return <div className="dashboard-event-list dashboard-event-summaries">{events.length?events.map(event=>{
  const summary=invitationSummary(data,data.invitations.filter(invitation=>invitation.eventId===event.id));
  return <Link className="dashboard-event dashboard-event-summary" key={event.id} to={'/events/'+encodeURIComponent(event.id)}>
   <div className="event-summary-heading"><WeddingFlower/><h3>{event.name}</h3><ArrowRight size={18}/></div>
   <p className="event-summary-date">{new Date(event.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}{event.time?' · '+event.time:''}</p>
   <p className="event-summary-venue">{event.location||'Location to follow'}</p>
   <div className="event-confirmed-total"><strong>{summary.confirmedGuests}</strong><span>{summary.confirmedUnknown?'Confirmed guests with recorded counts':'Confirmed guests'}</span></div>
   {summary.confirmedUnknown>0&&<p className="event-count-pending">{summary.confirmedUnknown} confirmed {summary.confirmedUnknown===1?'group still needs a headcount':'groups still need headcounts'}. The total above is incomplete.</p>}
   <dl className="event-group-counts">{[['Groups invited',summary.groups],['Groups confirmed',summary.confirmed],['Groups pending',summary.pending],['Groups declined',summary.declined]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </Link>;
 }):<div className="planning-empty wedding-planning-empty"><WeddingArt kind="celebration" className="wedding-empty-art"/><p>No events scheduled.</p></div>}</div>;
 return <div className="dashboard-event-list">{events.length?events.map(e=>{const s=invitationSummary(data,data.invitations.filter(i=>i.eventId===e.id));return <Link className="dashboard-event" key={e.id} to={'/events/'+encodeURIComponent(e.id)}><WeddingFlower/><div><h3>{e.name}</h3><p>{new Date(e.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}{e.time?' · '+e.time:''} · {e.location||'Location to follow'}</p><small>{s.groups} groups invited · {s.invited} known invited guests · {s.unknown} unknown counts</small><small>{s.confirmed} confirmed · {s.pending} pending · {s.declined} declined</small><small>{s.confirmedGuests} known confirmed guests · {s.confirmedUnknown} confirmed counts pending</small></div><ArrowRight size={15}/></Link>;}):<div className="planning-empty wedding-planning-empty"><WeddingArt kind="celebration" className="wedding-empty-art"/><p>No events scheduled.</p></div>}</div>;
}
function StayRow({data,stay}:{data:Dataset;stay:StayAllocation}) {
 const room=data.rooms.find(r=>r.id===stay.roomId);
 return <Link className="operations-row" to={allocationPath(stay,data.viewDate)}><span><strong>{stay.group||data.guests.find(g=>g.id===stay.guestGroupId)?.name||'Your guests'}</strong><small>{room?propertyForRoom(data,room)?.name:''} · Room {room?.number||'Unknown'} · {stay.headcountPending?'Guest count unknown':countOf(stay)+' assigned'}</small><small>{stay.lifecycle==='completed'?'Checked out':stay.checkedIn?stay.arrived+' arrived':'Awaiting check-in'} · {stayDates(stay.checkIn,stay.checkOut)}</small></span><ArrowRight size={15}/></Link>;
}
export function OverdueAttention({data}:{data:Dataset}) {
 const overdue=overdueStays(data);
 return overdue.length?<section className="panel operations-panel overdue-panel"><h3>Overdue occupied stays <span>{overdue.length}</span></h3><p className="inventory-hint">Needs attention as of today. Open the stay to review its room.</p>{overdue.map(stay=><StayRow key={stay.id} data={data} stay={stay}/>)}</section>:null;
}
export function DashboardExtras({data}:{data:Dataset}) {
 const operational=operationsForDate(data),date=data.viewDate||data.wedding.defaultDate;
 const booked=data.rooms.filter(r=>r.booked!==false||r.overdue);
 const assigned=booked.reduce((sum,r)=>sum+roomOccupancy(r).assigned,0),arrived=booked.reduce((sum,r)=>sum+roomOccupancy(r).arrived,0);
 return <section className="dashboard-operations">
 <section className="panel operations-panel"><h3>Arrival progress</h3><p>{arrived} of {assigned} known assigned occupants arrived</p><div className="arrival-track"><span style={{width:(assigned?arrived/assigned*100:0)+'%'}}/></div><p className="inventory-hint">{assigned-arrived} awaiting arrival · {booked.reduce((sum,r)=>sum+r.capacity,0)} total room capacity · {booked.filter(r=>r.allocation?.headcountPending).length} guest counts unknown</p></section>
 <div className="section-heading"><h2>Events on this date</h2></div><EventCards data={data} events={operational.events}/>
 <div className="operations-columns"><section className="panel operations-panel"><h3>Scheduled arrivals <span>{operational.arrivals.length}</span></h3><p className="inventory-hint">{operational.awaiting.length} stays still awaiting check-in. Scheduled arrivals include stays already checked in or completed.</p>{operational.arrivals.length?operational.arrivals.map(stay=><StayRow key={stay.id} data={data} stay={stay}/>):<p className="inventory-hint">No check-ins scheduled.</p>}</section><section className="panel operations-panel"><h3>Scheduled departures <span>{operational.departures.length}</span></h3><p className="inventory-hint">Planned checkout dates; actual checkout is recorded separately.</p>{operational.departures.length?operational.departures.map(stay=><StayRow key={stay.id} data={data} stay={stay}/>):<p className="inventory-hint">No checkouts scheduled.</p>}</section></div>
 <Link className="text-link" to={roomsPath(date)}>Browse this night's rooms<ArrowRight size={15}/></Link>
 </section>;
}
export function NightOperations({data}:{data:Dataset}){
 const operational=operationsForDate(data),date=data.viewDate||data.wedding.defaultDate,booked=data.rooms.filter(room=>room.booked!==false||room.overdue);
 const assigned=booked.reduce((sum,room)=>sum+roomOccupancy(room).assigned,0),arrived=booked.reduce((sum,room)=>sum+roomOccupancy(room).arrived,0),unknown=booked.filter(room=>room.allocation?.headcountPending).length;
 const hasSchedule=!!(operational.arrivals.length||operational.departures.length||operational.events.length);
 return <section className="night-operations" aria-label="Activity for the selected date">
  {(assigned>0||unknown>0)&&<section className="night-arrival-progress" aria-labelledby="night-arrival-progress-title"><div><h2 id="night-arrival-progress-title"><Users size={17}/>Arrival progress</h2>{assigned>0&&<p><strong>{arrived} of {assigned}</strong> guests with recorded counts have arrived<span> · {Math.max(0,assigned-arrived)} awaiting arrival</span></p>}{unknown>0&&<p className="night-unknown-counts">Guest counts are still needed for {unknown} {unknown===1?'room':'rooms'}. {assigned>0?'The progress above excludes these unknown counts.':'Add counts before checking guests in.'} <Link className="text-link" to={roomsPath(date)}>Review rooms<ArrowRight size={13}/></Link></p>}</div>{assigned>0&&<div className="night-progress-track" role="progressbar" aria-label="Guests arrived with recorded counts" aria-valuenow={arrived} aria-valuemin={0} aria-valuemax={assigned}><span style={{width:Math.min(100,arrived/assigned*100)+'%'}}/></div>}</section>}
  {(operational.arrivals.length>0||operational.departures.length>0)&&<div className="night-schedule-columns">{operational.arrivals.length>0&&<section className="night-schedule-panel" aria-labelledby="night-arrivals-title"><div className="night-overview-section-title"><h2 id="night-arrivals-title"><LogIn size={17}/>Scheduled arrivals</h2><span>{operational.arrivals.length}</span></div><p className="night-schedule-hint">{operational.awaiting.length} stays awaiting check-in. Includes stays already checked in or completed.</p>{operational.arrivals.map(stay=><StayRow key={stay.id} data={data} stay={stay}/>)}</section>}{operational.departures.length>0&&<section className="night-schedule-panel" aria-labelledby="night-departures-title"><div className="night-overview-section-title"><h2 id="night-departures-title"><LogOut size={17}/>Scheduled departures</h2><span>{operational.departures.length}</span></div><p className="night-schedule-hint">Planned checkout dates; actual checkout is recorded separately.</p>{operational.departures.map(stay=><StayRow key={stay.id} data={data} stay={stay}/>)}</section>}</div>}
  {operational.events.length>0&&<section className="night-date-events" aria-labelledby="night-events-title"><div className="night-overview-section-title"><h2 id="night-events-title"><CalendarDays size={17}/>Events on this date</h2><span>{operational.events.length}</span></div><div>{operational.events.map(event=><Link className="night-event-row" key={event.id} to={'/events/'+encodeURIComponent(event.id)}><WeddingFlower/><div><h3>{event.name}</h3><p>{event.time?event.time+' · ':''}{event.location||'Location to follow'}</p></div><ArrowRight size={16}/></Link>)}</div></section>}
  {!hasSchedule&&<p className="night-quiet-message">No arrivals, departures or events are scheduled for this date.</p>}
 </section>;
}
