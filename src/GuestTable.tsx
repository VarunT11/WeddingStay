import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown,Pencil} from 'lucide-react';
import {type Dataset,type GuestGroup,type Invitation} from './data';
import {saveInvitation} from './management';
import {Link} from './navigation';

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
type Props={guests:GuestGroup[];data:Dataset;selected:string|null;sort:GuestSort;direction:SortDirection;onSort:(sort:GuestSort,direction:SortDirection)=>void;onOpen:(id:string)=>void;eventId?:string;editingInvitation:string|null;onRsvp:(id:string|null)=>void;commit:(data:Dataset,message:string)=>Promise<boolean>;onDirty:(dirty:boolean)=>void};
export function GuestTable({guests,data,selected,sort,direction,onSort,onOpen,eventId,editingInvitation,onRsvp,commit,onDirty}:Props) {
 const events=new Map(data.events.map(e=>[e.id,e]));
 function invites(id:string){return data.invitations.filter(i=>i.guestGroupId===id&&(!eventId||i.eventId===eventId)).sort((a,b)=>(events.get(a.eventId)?.date||'').localeCompare(events.get(b.eventId)?.date||'')||(events.get(a.eventId)?.name||'').localeCompare(events.get(b.eventId)?.name||'')||a.id.localeCompare(b.id));}
 function heading(key:GuestSort,label:string,className=''){return <th scope="col" className={className} aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):'none'}><button className="guest-sort-button" onClick={()=>onSort(key,sort===key&&direction==='asc'?'desc':'asc')}>{label}{sort===key?(direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}</button></th>;}
 return <>
 <label className="guest-mobile-sort">Sort guests<select value={sort+'-'+direction} onChange={e=>{const [key,order]=e.target.value.split('-');onSort(key as GuestSort,order as SortDirection);}}><option value="name-asc">Name · A–Z</option><option value="name-desc">Name · Z–A</option><option value="category-asc">Category · A–Z</option><option value="category-desc">Category · Z–A</option><option value="headcount-asc">Headcount · low to high</option><option value="headcount-desc">Headcount · high to low</option></select></label>
 <div className="guest-table-wrap"><table className={'guest-table enhanced-guests '+(eventId?'event-guests':'master-guests')}><caption className="sr-only">{eventId?'Guest groups and RSVP for '+events.get(eventId)?.name:'Master guest groups, linked events and separate event responses'}</caption><thead><tr>{heading('name','Guest / family')}{heading('category','Category','guest-desktop-cell')}{heading('headcount','Headcount','guest-count-cell')}{!eventId&&<th className="guest-desktop-cell">Events</th>}<th>RSVP</th><th className="guest-stay-cell">Accommodation</th></tr></thead><tbody>{guests.map(guest=>{const invitations=invites(guest.id),count=new Set(data.allocations.filter(a=>a.lifecycle==='active'&&a.guestGroupId===guest.id).map(a=>a.roomId)).size;return <tr key={guest.id} className={selected===guest.id?'selected':''} onClick={()=>onOpen(guest.id)}>
 <td><button className="guest-name-button" aria-label={'View '+guest.name} aria-haspopup="dialog" onClick={e=>{e.stopPropagation();onOpen(guest.id);}}>{guest.name}</button><div className="guest-mobile-details"><small>{guest.category||'Uncategorised'}</small></div></td>
 <td className="guest-desktop-cell"><span className="allocation-label">{guest.category||'Uncategorised'}</span></td>
 <td className="guest-count-cell">{guest.headcount===null?<span className="guest-muted">Unknown</span>:guest.headcount}</td>
 {!eventId&&<td className="guest-desktop-cell">{invitations.length?invitations.map(i=><div key={i.id} className="guest-event-cell" style={{minHeight:editingInvitation===i.id?220:i.response==='Confirmed'?60:44}}><Link to={'/events/'+encodeURIComponent(i.eventId)} onClick={e=>e.stopPropagation()}>{events.get(i.eventId)?.name}</Link></div>):<span className="guest-muted">No invitations</span>}</td>}
 <td onClick={e=>e.stopPropagation()}>{invitations.length?invitations.map(i=><div key={i.id} className="guest-response-cell" style={!eventId?{minHeight:editingInvitation===i.id?220:i.response==='Confirmed'?60:44}:undefined}>{!eventId&&<small className="rsvp-event-label">{events.get(i.eventId)?.name}</small>}{editingInvitation===i.id?<InlineRsvp key={i.id} invitation={i} data={data} commit={commit} onClose={()=>onRsvp(null)} onDirty={onDirty}/>:<><button className="rsvp-button" aria-label={'Update RSVP for '+guest.name+' at '+events.get(i.eventId)?.name} disabled={!!editingInvitation} onClick={()=>onRsvp(i.id)}><span className={'response-badge '+i.response.toLowerCase()}>{i.response}<Pencil size={11}/></span></button>{i.response==='Confirmed'&&<small>{i.confirmedHeadcount===null?'Count pending':i.confirmedHeadcount+' confirmed'}</small>}</>}</div>):<span className="guest-muted">—</span>}</td>
 <td className="guest-stay-cell"><span>{guest.needsAccommodation===null?'Not assessed':guest.needsAccommodation?'Needed':'Not needed'}</span><small className="guest-linked-rooms">{count} {count===1?'room':'rooms'} linked</small></td>
 </tr>;})}</tbody></table></div>
 </>;
}
function InlineRsvp({invitation,data,commit,onClose,onDirty}:{invitation:Invitation;data:Dataset;commit:Props['commit'];onClose:()=>void;onDirty:Props['onDirty']}){
 const base=useRef(invitation).current,[response,setResponse]=useState(base.response),[count,setCount]=useState(base.confirmedHeadcount===null?'':String(base.confirmedHeadcount)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dirty=response!==base.response||count!==(base.confirmedHeadcount===null?'':String(base.confirmedHeadcount));
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 async function save(){setBusy(true);setError('');try{if(await commit(saveInvitation(data,{...base,response,confirmedHeadcount:count.trim()===''?null:Number(count)}),'RSVP saved')){onDirty(false);onClose();}else setError('Could not save. Your response is kept here.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not save RSVP.');}finally{setBusy(false);}}
 return <div className="inline-rsvp"><label><span className="sr-only">Event response</span><select autoFocus value={response} disabled={busy} onChange={e=>{const value=e.target.value as Invitation['response'];setResponse(value);if(value!=='Confirmed')setCount('');}}><option>Pending</option><option>Confirmed</option><option>Declined</option></select></label>{response==='Confirmed'&&<label>Confirmed guests<input type="number" min={0} step={1} placeholder="Unknown" value={count} disabled={busy} onChange={e=>setCount(e.target.value)}/></label>}<div><button className="text-link" disabled={busy} onClick={()=>void save()}>Save</button><button className="quiet-button" disabled={busy} onClick={()=>{onDirty(false);onClose();}}>Cancel</button></div>{error&&<p className="field-error" role="alert">{error}</p>}</div>;
}
