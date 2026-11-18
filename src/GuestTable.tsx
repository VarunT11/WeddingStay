import {useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown,Pencil} from 'lucide-react';
import {type Dataset,type GuestGroup,type Invitation} from './data';
import {Link} from './navigation';
import {accommodationText,guestCountText} from './GuestsUI';
import './guest-matrix.css';
import {useGuestListMobile,useGuestListScroll,type GuestMobileView} from './GuestListView';

export type GuestSort='name'|'category'|'headcount';
export type SortDirection='asc'|'desc';
export function sortGuests(guests:GuestGroup[],sort:GuestSort,direction:SortDirection) {
 const multiplier=direction==='asc'?1:-1;
 return [...guests].sort((a,b)=>{
  if(sort==='headcount'&&(a.headcount===null||b.headcount===null)&&a.headcount!==b.headcount)return a.headcount===null?1:-1;
  const difference=sort==='headcount'?(a.headcount??0)-(b.headcount??0):sort==='category'?(a.category||'Uncategorised').localeCompare(b.category||'Uncategorised'):a.name.localeCompare(b.name);
  return difference*multiplier||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
 });
}
type Props={mobileView:GuestMobileView;scrollKey:string;guests:GuestGroup[];data:Dataset;selected:string|null;sort:GuestSort;direction:SortDirection;onSort:(sort:GuestSort,direction:SortDirection)=>void;onOpen:(id:string)=>void;onEvents:(id:string,eventId?:string)=>void;eventId?:string;invitationEventId?:string;editingInvitation:string|null;onRsvp:(id:string|null)=>void;onAccommodation:(id:string,trigger:HTMLElement)=>void;commit:(data:Dataset,message:string)=>Promise<boolean>;onDirty:(dirty:boolean)=>void};
function confirmedText(invitation?:Invitation){return !invitation||invitation.response!=='Confirmed'?'—':invitation.confirmedHeadcount===null?'Count needed':guestCountText(invitation.confirmedHeadcount);}
export function GuestTable({mobileView,scrollKey,guests,data,selected,sort,direction,onSort,onOpen,onEvents,eventId,invitationEventId,editingInvitation,onRsvp,onAccommodation,commit,onDirty}:Props) {
 const helpId=useId(),mobile=useGuestListMobile(),matrix=useRef<HTMLDivElement>(null),cards=useRef<HTMLDivElement>(null);
 const [overflows,setOverflows]=useState(false);
 useGuestListScroll(matrix,cards,mobile,mobileView,scrollKey);
 useLayoutEffect(()=>{const element=matrix.current;if(!element)return;const measure=()=>setOverflows(element.clientWidth>0&&element.scrollWidth>element.clientWidth+1);measure();const observer=new ResizeObserver(measure);observer.observe(element);const table=element.querySelector('table');if(table)observer.observe(table);return()=>observer.disconnect();},[mobile,mobileView]);
 const index=useMemo(()=>{
  const invitations=new Map<string,Map<string,Invitation>>(),rooms=new Map<string,Set<string>>();
  for(const invitation of data.invitations){let group=invitations.get(invitation.guestGroupId);if(!group){group=new Map();invitations.set(invitation.guestGroupId,group);}group.set(invitation.eventId,invitation);}
  for(const stay of data.allocations){if(stay.lifecycle!=='active'||!stay.guestGroupId)continue;let group=rooms.get(stay.guestGroupId);if(!group){group=new Set();rooms.set(stay.guestGroupId,group);}group.add(stay.roomId);}
  return {invitations,rooms,eventNames:new Map(data.events.map(event=>[event.id,event.name]))};
 },[data.invitations,data.allocations,data.events]);
 const columns=useMemo(()=>[...data.events].filter(event=>!(eventId||invitationEventId)||event.id===(eventId||invitationEventId)).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)),[data.events,eventId,invitationEventId]);

 function heading(key:GuestSort,label:string){return <th scope="col" aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):'none'}><button className="guest-sort-button" onClick={()=>onSort(key,sort===key&&direction==='asc'?'desc':'asc')}>{label}{sort===key?(direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}</button></th>;}
 function response(invitation:Invitation|undefined,guest:GuestGroup,missingEventId?:string){return invitation?<div className="matrix-response"><button type="button" className="matrix-rsvp-trigger" data-guest-rsvp-id={invitation.id} aria-haspopup="dialog" aria-expanded={editingInvitation===invitation.id} aria-label={'Update RSVP for '+guest.name+' at '+index.eventNames.get(invitation.eventId)} onClick={()=>onRsvp(invitation.id)}><span className={'response-badge '+invitation.response.toLowerCase()}>{invitation.response}<Pencil size={12} aria-hidden="true"/></span></button>{invitation.response==='Confirmed'&&<small className={invitation.confirmedHeadcount===null?'matrix-unknown':'matrix-confirmed'}>{confirmedText(invitation)}{invitation.confirmedHeadcount!==null?' confirmed':''}</small>}</div>:<button type="button" className="matrix-not-invited guest-edit-events" data-guest-events-id={guest.id} aria-label={"Invite "+guest.name+" to "+index.eventNames.get(missingEventId||'')} onClick={()=>onEvents(guest.id,missingEventId)}>Not invited +</button>;}
 function stay(guest:GuestGroup){const count=index.rooms.get(guest.id)?.size||0;return <div className="matrix-stay-summary"><button type="button" data-guest-stay-id={guest.id} className={'accommodation-trigger guest-matrix-stay-trigger '+(guest.needsAccommodation===null?'unknown':guest.needsAccommodation?'needed':'not-needed')} aria-label={'Edit stay needs for '+guest.name} aria-haspopup="dialog" onClick={event=>onAccommodation(guest.id,event.currentTarget)}>{accommodationText(guest.needsAccommodation)}<Pencil size={13} aria-hidden="true"/></button><button type="button" className="matrix-linked-rooms" disabled={!count} aria-label={'View '+count+' linked rooms for '+guest.name} onClick={()=>onOpen(guest.id)}>{count} {count===1?'room':'rooms'} linked</button></div>;}
 const width=mobile?280+columns.length*128:520+columns.length*160;
 return <>
 <div className="guest-list-results" data-mobile-view={mobileView}>
 <p className="guest-matrix-help" id={helpId}>Expected is the whole family; confirmed counts are per event.{overflows&&(!mobile||mobileView==='matrix')&&<span className="matrix-scroll-hint"> {mobile?'Swipe sideways to compare events.':'Scroll sideways to compare events.'}</span>}</p>
 <div className="guest-matrix-viewport" ref={matrix} role="region" aria-label={eventId?'Event guest table':'Guest RSVP matrix'} aria-describedby={helpId} tabIndex={0}>
 <table className="guest-matrix" style={{minWidth:width}}><caption className="sr-only">{eventId?'Guest groups and responses for '+columns[0]?.name:'Guest groups with a separate RSVP column for each event'}</caption><colgroup><col className="matrix-name-col"/>{!mobile&&<col className="matrix-expected-col"/>}{columns.map(event=><col className="matrix-event-col" key={event.id}/>)}<col className="matrix-stay-col"/></colgroup>
 <thead><tr>{heading('name','Guest / family')}{!mobile&&heading('headcount','Expected guests')}{columns.map(event=><th scope="col" key={event.id}><div className="matrix-event-heading"><Link to={'/events/'+encodeURIComponent(event.id)}>{event.name}</Link><small>{new Date(event.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</small></div></th>)}<th scope="col">Stay needs</th></tr></thead>
 <tbody>{guests.map(guest=>{const invitations=index.invitations.get(guest.id);return <tr key={guest.id} className={selected===guest.id?'selected':''}><td><button type="button" className="guest-name-button" data-guest-open-id={guest.id} aria-label={'View '+guest.name} aria-haspopup="dialog" onClick={()=>onOpen(guest.id)}>{guest.name}</button><span className="matrix-category">{guest.category||'Uncategorised'}</span><span className="matrix-mobile-expected">{guest.headcount===null?'Expected: Unknown':guest.headcount+' expected'}</span><button type="button" className="guest-edit-events" data-guest-events-id={guest.id} onClick={()=>onEvents(guest.id)}>Edit events</button></td>{!mobile&&<td>{guest.headcount===null?<span className="matrix-unknown">Unknown</span>:guest.headcount}</td>}{columns.map(event=><td key={event.id}>{response(invitations?.get(event.id),guest,event.id)}</td>)}<td>{stay(guest)}</td></tr>;})}</tbody></table>
 </div>
 <div className="guest-matrix-cards guest-compact-list" ref={cards}>{guests.map(guest=>{const invitations=index.invitations.get(guest.id),focused=eventId||invitationEventId,all=[...(invitations?.values()||[])],pending=all.filter(i=>i.response==='Pending').length;return <article key={guest.id} className={'guest-compact-row'+(selected===guest.id?' selected':'')}><div className="guest-compact-identity"><button type="button" className="guest-name-button" data-guest-open-id={guest.id} aria-haspopup="dialog" onClick={()=>onOpen(guest.id)}>{guest.name}</button><small>{guest.category||'Uncategorised'} · {guest.headcount===null?'Expected count unknown':guest.headcount+' expected'}</small></div><div className="guest-compact-response">{focused?response(invitations?.get(focused),guest,focused):<small>{all.length} {all.length===1?'event':'events'}{pending?' · '+pending+' pending':''}</small>}<button type="button" className="guest-edit-events" data-guest-events-id={guest.id} onClick={()=>onEvents(guest.id)}>Edit events</button></div></article>;})}</div>
 </div>
 </>;
}
