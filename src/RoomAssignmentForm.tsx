import {useEffect,useId,useRef,useState} from 'react';
import {CalendarDays,ChevronDown,Minus,Plus,Users} from 'lucide-react';
import {roomSpace,type Allocation,type Dataset,type Room,type StayAllocation} from './data';
import {AssignmentGuestPicker} from './AssignmentGuestPicker';
import {stayDates} from './StayUI';
import './room-assignment.css';

export type AssignmentErrors={dates:string;identity:string;count:string;names:string;arrivals:string};
type Props={data:Dataset;room:Room;selected?:StayAllocation;draft:Allocation;names:string;guestCount:string;errors:AssignmentErrors;attempt:number;busy:boolean;newLabel:string;onDraft:(value:Allocation)=>void;onNames:(value:string)=>void;onCount:(value:string)=>void;onPending:()=>void;onNewLabel:(value:string)=>void;onCreateLabel:()=>Promise<void>;onEditRoom:()=>void;onSubmit:(event:React.FormEvent)=>void};
export function RoomAssignmentForm({data,room,selected,draft,names,guestCount,errors,attempt,busy,newLabel,onDraft,onNames,onCount,onPending,onNewLabel,onCreateLabel,onEditRoom,onSubmit}:Props){
 const [datesOpen,setDatesOpen]=useState(!!errors.dates),[moreOpen,setMoreOpen]=useState(false),[touched,setTouched]=useState({identity:false,count:false,dates:false,names:false,arrivals:false});
 const dates=useRef<HTMLDetailsElement>(null),who=useRef<HTMLDivElement>(null),count=useRef<HTMLInputElement>(null),more=useRef<HTMLDetailsElement>(null),namesInput=useRef<HTMLTextAreaElement>(null),arrivals=useRef<HTMLInputElement>(null),id=useId();
 const property=data.properties.find(property=>property.id===data.areas.find(area=>area.id===room.areaId)?.propertyId),pending=!!draft.headcountPending;
 const space=roomSpace(data,room.id,{checkIn:draft.checkIn||'',checkOut:draft.checkOut||''},selected?.id),maximum=space.remaining;
 const named=names.split('\n').filter(name=>name.trim()).length,minCount=Math.max(1,named,selected?.arrived||0),number=Number(guestCount);
 const show=(field:keyof AssignmentErrors)=>!!errors[field]&&(attempt>0||touched[field]);
 useEffect(()=>{
  if(!attempt)return;
  if(errors.dates)setDatesOpen(true);
  if(!errors.dates&&!errors.identity&&!errors.count&&(errors.names||errors.arrivals))setMoreOpen(true);
  const frame=requestAnimationFrame(()=>{
   const target=errors.dates?dates.current?.querySelector<HTMLInputElement>('input'):errors.identity?who.current?.querySelector<HTMLButtonElement>('button'):errors.count?count.current:errors.names?namesInput.current:errors.arrivals?arrivals.current:null;
   target?.focus();target?.scrollIntoView({block:'nearest'});
  });return()=>cancelAnimationFrame(frame);
 },[attempt]);
 function selectGuest(value:Dataset['guests'][number]|string){
  const previous=data.guests.find(guest=>guest.id===draft.guestGroupId);
  if(typeof value==='string'){onDraft({...draft,guestGroupId:undefined,group:value,contact:previous&&draft.contact===previous.contact?'':draft.contact});}
  else onDraft({...draft,guestGroupId:value.id,group:previous&&draft.group&&draft.group!==previous.name?draft.group:value.name,contact:!draft.contact||draft.contact===previous?.contact?value.contact:draft.contact});
  setTouched(current=>({...current,identity:true}));
 }
 return <form className="assignment-form" id="dated-stay-form" noValidate onSubmit={onSubmit}>
  <fieldset className="assignment-fields" disabled={busy}>
   <details className="assignment-dates" open={datesOpen} ref={dates} onToggle={event=>setDatesOpen(event.currentTarget.open)}><summary><CalendarDays size={17}/><span><strong>{stayDates(draft.checkIn,draft.checkOut)}</strong><small>Check-in → checkout</small></span><span className="assignment-change-dates">{datesOpen?'Hide dates':'Change dates'}<ChevronDown size={14}/></span></summary><div className="assignment-date-inputs"><label>Check-in<input type="date" value={draft.checkIn||''} aria-invalid={show('dates')} onBlur={()=>setTouched(current=>({...current,dates:true}))} onChange={event=>onDraft({...draft,checkIn:event.target.value})}/></label><label>Checkout<input type="date" value={draft.checkOut||''} aria-invalid={show('dates')} onBlur={()=>setTouched(current=>({...current,dates:true}))} onChange={event=>onDraft({...draft,checkOut:event.target.value})}/></label></div><p className="assignment-help">Checkout day isn’t included. The full stay must fit within one property booking.</p><details className="assignment-booking-ranges"><summary>View booked dates</summary><ul>{property?.bookedRanges.map((range,index)=><li key={index}>{stayDates(range.checkIn,range.checkOut)}</li>)}</ul>{!property?.bookedRanges.length&&<p>No booked dates recorded for this property.</p>}</details></details>
   {errors.dates&&<p className={show('dates')?'field-error':'assignment-date-warning'} role={show('dates')?'alert':'status'}>{errors.dates}</p>}
   <div ref={who}><AssignmentGuestPicker guests={data.guests} guestId={draft.guestGroupId} name={draft.group} disabled={busy} error={show('identity')?errors.identity:undefined} onSelect={selectGuest} onBlur={()=>setTouched(current=>({...current,identity:true}))}/></div>
   <section className="assignment-count" aria-labelledby={id+'-count-title'}><div className="assignment-count-heading"><h3 id={id+'-count-title'}><Users size={16}/>Guests in this room</h3><small>Up to {maximum} remaining</small></div><div className="assignment-count-modes"><button type="button" aria-pressed={pending} disabled={!!selected?.checkedIn||space.others.length>0} onClick={()=>{if(!pending)onPending();}}>Add count later</button><button type="button" aria-pressed={!pending} onClick={()=>onDraft({...draft,headcountPending:false})}>Enter count</button></div>{pending?<p className="assignment-help">Reserve the room now. Add the guest count before check-in.</p>:<><div className="assignment-total"><button type="button" className="icon-button" aria-label="Decrease guests in this room" disabled={!guestCount||!Number.isInteger(number)||number<=minCount} onClick={()=>{onCount(String(number-1));setTouched(current=>({...current,count:true}));}}><Minus size={17}/></button><label><span className="assignment-sr-only">Total guests in this room</span><input ref={count} type="number" inputMode="numeric" min={minCount} max={maximum} step={1} value={guestCount} placeholder="0" aria-invalid={show('count')} aria-describedby={show('count')?id+'-count-error':id+'-count-help'} onChange={event=>onCount(event.target.value)} onBlur={()=>setTouched(current=>({...current,count:true}))}/></label><button type="button" className="icon-button" aria-label="Increase guests in this room" disabled={!!guestCount&&(!Number.isInteger(number)||number>=maximum)} onClick={()=>{onCount(String(guestCount?number+1:minCount));setTouched(current=>({...current,count:true}));}}><Plus size={17}/></button></div><p id={id+'-count-help'} className="assignment-help">Count only the guests staying in this room. Names are optional.</p>{show('count')&&<p className="field-error" id={id+'-count-error'}>{errors.count}</p>}</>}</section>
   <details className="assignment-more" ref={more} open={moreOpen} onToggle={event=>setMoreOpen(event.currentTarget.open)}><summary>More details<span>Optional<ChevronDown size={15}/></span></summary><div className="assignment-extra-fields">
    {draft.guestGroupId&&<label>Reservation name<span>optional override</span><input value={draft.group} placeholder={data.guests.find(guest=>guest.id===draft.guestGroupId)?.name} onChange={event=>onDraft({...draft,group:event.target.value})}/></label>}
    {!pending&&<label>Guest names<span>optional · one per line</span><textarea ref={namesInput} value={names} rows={3} aria-invalid={show('names')} onChange={event=>onNames(event.target.value)} onBlur={()=>setTouched(current=>({...current,names:true}))}/><small>{named} named · {Number.isInteger(number)&&number>=named?number-named:0} without names</small>{show('names')&&<p className="field-error">{errors.names}</p>}</label>}
    {selected?.checkedIn&&<label>Guests arrived<input ref={arrivals} type="number" min={0} max={number} step={1} value={draft.arrived} aria-invalid={show('arrivals')} onBlur={()=>setTouched(current=>({...current,arrivals:true}))} onChange={event=>{const value=Number(event.target.value);onDraft({...draft,arrived:value,checkedIn:value>0});}}/>{show('arrivals')&&<p className="field-error">{errors.arrivals}</p>}</label>}
    <label>Contact<span>optional</span><input type="tel" value={draft.contact} onChange={event=>onDraft({...draft,contact:event.target.value})}/></label><label>Shared label<span>optional</span><select value={draft.labelId||''} onChange={event=>onDraft({...draft,labelId:event.target.value||undefined})}><option value="">No label</option>{data.labels.map(label=><option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
    <details className="assignment-label-create"><summary>Create a shared label</summary><div><input aria-label="New shared label name" value={newLabel} onChange={event=>onNewLabel(event.target.value)} placeholder="Label name"/><button type="button" className="button secondary" disabled={!newLabel.trim()} onClick={()=>void onCreateLabel()}>Create label</button></div></details>
    <label>Notes<span>optional</span><textarea rows={2} value={draft.notes} onChange={event=>onDraft({...draft,notes:event.target.value})}/></label>{room.notes&&<p className="assignment-room-note"><strong>About this room</strong>{room.notes}</p>}<button type="button" className="text-link" onClick={onEditRoom}>Edit room details</button>
   </div></details>
  </fieldset>
 </form>;
}
