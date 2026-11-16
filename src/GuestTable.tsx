import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';
import {type Dataset,type GuestGroup} from './data';

export type GuestSort='name'|'category'|'headcount';
export type SortDirection='asc'|'desc';
export function sortGuests(guests:GuestGroup[],sort:GuestSort,direction:SortDirection) {
 const multiplier=direction==='asc'?1:-1;
 return [...guests].sort((a,b)=>{
  if(sort==='headcount'&&(a.headcount===null||b.headcount===null)){
   if(a.headcount!==b.headcount)return a.headcount===null?1:-1;
  }
  const difference=sort==='headcount'?(a.headcount??0)-(b.headcount??0):sort==='category'?(a.category||'Uncategorised').localeCompare(b.category||'Uncategorised'):a.name.localeCompare(b.name);
  return difference*multiplier||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
 });
}

export function GuestTable({guests,data,selected,sort,direction,onSort,onOpen}:{guests:GuestGroup[];data:Dataset;selected:string|null;sort:GuestSort;direction:SortDirection;onSort:(sort:GuestSort,direction:SortDirection)=>void;onOpen:(id:string)=>void}) {
 const invitations=new Map<string,Dataset['invitations']>();
 for(const invitation of data.invitations){const list=invitations.get(invitation.guestGroupId)||[];list.push(invitation);invitations.set(invitation.guestGroupId,list);}
 const events=new Map(data.events.map(event=>[event.id,event]));
 const linkedRooms=new Map<string,Set<string>>();
 for(const allocation of data.allocations){if(allocation.lifecycle!=='active'||!allocation.guestGroupId)continue;const rooms=linkedRooms.get(allocation.guestGroupId)||new Set<string>();rooms.add(allocation.roomId);linkedRooms.set(allocation.guestGroupId,rooms);}
 function heading(key:GuestSort,label:string,className='') {return <th scope="col" className={className} aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):'none'}><button className="guest-sort-button" onClick={()=>onSort(key,sort===key&&direction==='asc'?'desc':'asc')}>{label}{sort===key?(direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}</button></th>;}
 function eventBadges(guestId:string){const invites=[...(invitations.get(guestId)||[])].sort((a,b)=>{const x=events.get(a.eventId),y=events.get(b.eventId);return (x?.date||'').localeCompare(y?.date||'')||(x?.name||'').localeCompare(y?.name||'')||a.id.localeCompare(b.id);});return <div className="guest-event-badges">{invites.length?invites.map(invite=><span key={invite.id} className={'response-badge '+invite.response.toLowerCase()}>{events.get(invite.eventId)?.name||'Event'} · {invite.response}</span>):<span className="guest-muted">No invitations</span>}</div>;}
 return <>
 <label className="guest-mobile-sort">Sort guests<select value={sort+'-'+direction} onChange={e=>{const [key,order]=e.target.value.split('-');onSort(key as GuestSort,order as SortDirection);}}><option value="name-asc">Name · A–Z</option><option value="name-desc">Name · Z–A</option><option value="category-asc">Category · A–Z</option><option value="category-desc">Category · Z–A</option><option value="headcount-asc">Headcount · low to high</option><option value="headcount-desc">Headcount · high to low</option></select></label>
 <div className="guest-table-wrap"><table className="guest-table"><caption className="sr-only">Guest groups, event responses and accommodation across all wedding dates</caption><colgroup><col className="guest-name-col"/><col className="guest-category-col"/><col className="guest-count-col"/><col className="guest-events-col"/><col className="guest-stay-col"/></colgroup><thead><tr>{heading('name','Guest / family')}{heading('category','Category','guest-desktop-cell')}{heading('headcount','Headcount','guest-count-cell')}<th scope="col" className="guest-desktop-cell">Events / RSVP</th><th scope="col">Accommodation</th></tr></thead><tbody>{guests.map(guest=>{const count=linkedRooms.get(guest.id)?.size||0;return <tr key={guest.id} className={selected===guest.id?'selected':''} onClick={()=>onOpen(guest.id)}><td><button className="guest-name-button" aria-label={'View '+guest.name} aria-haspopup="dialog" onClick={e=>{e.stopPropagation();onOpen(guest.id);}}>{guest.name}</button><div className="guest-mobile-details"><small>{guest.category||'Uncategorised'}</small>{eventBadges(guest.id)}</div></td><td className="guest-desktop-cell">{guest.category||'Uncategorised'}</td><td className="guest-count-cell">{guest.headcount===null?<span className="guest-muted">Unknown</span>:guest.headcount}</td><td className="guest-desktop-cell">{eventBadges(guest.id)}</td><td><span>{guest.needsAccommodation===null?'Not assessed':guest.needsAccommodation?'Needed':'Not needed'}</span><small className="guest-linked-rooms">{count} {count===1?'room':'rooms'} linked</small></td></tr>;})}</tbody></table></div>
 </>;
}
