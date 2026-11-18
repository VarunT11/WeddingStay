import {useId,useRef,useState} from 'react';
import {Check,ChevronDown,Search,UserRound,X} from 'lucide-react';
import {type GuestGroup} from './data';

type Props={guests:GuestGroup[];guestId?:string;name:string;disabled:boolean;error?:string;onSelect:(guest:GuestGroup|string)=>void;onBlur:()=>void};
export function AssignmentGuestPicker({guests,guestId,name,disabled,error,onSelect,onBlur}:Props){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),id=useId(),toggle=useRef<HTMLButtonElement>(null),selected=guests.find(guest=>guest.id===guestId);
 const text=query.trim(),matches=guests.filter(guest=>!text||[guest.name,guest.category,guest.contact,...guest.members].some(value=>value.toLocaleLowerCase().includes(text.toLocaleLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 function choose(value:GuestGroup|string){onSelect(value);setOpen(false);setQuery('');toggle.current?.focus();}
 return <div className="assignment-guest-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))onBlur();}} onKeyDownCapture={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);toggle.current?.focus();}}}>
  <label className="assignment-field-title" id={id+'-label'}>Who is this room for?</label>
  <button ref={toggle} type="button" className="assignment-guest-toggle" aria-labelledby={id+'-label '+id+'-value'} aria-expanded={open} aria-controls={id+'-choices'} aria-invalid={!!error} aria-describedby={error?id+'-error':undefined} disabled={disabled} onClick={()=>{setOpen(!open);setQuery('');}}><UserRound size={18}/><span id={id+'-value'}>{selected?.name||name||'Choose a guest group or enter a name'}{selected&&<small>Linked guest group</small>}{!selected&&name&&<small>Reservation name · no guest-group link</small>}</span><ChevronDown size={16}/></button>
  {open&&<div className="assignment-guest-choices" id={id+'-choices'}><div className="assignment-guest-search"><Search size={16}/><input autoFocus type="search" aria-label="Search guest groups or type a reservation name" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a family, or type a name…" onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}/><button type="button" className="icon-button" aria-label="Close guest choices" onClick={()=>{setOpen(false);toggle.current?.focus();}}><X size={15}/></button></div>{text&&<button type="button" className="assignment-unlinked-choice" onClick={()=>choose(text)}><PlusName/><span>Use “{text}” without linking<small>Assign this room without creating a guest group</small></span></button>}<div className="assignment-guest-results" aria-label="Matching guest groups">{matches.length?matches.map(guest=><button type="button" key={guest.id} onClick={()=>choose(guest)} aria-pressed={guest.id===guestId}><span><strong>{guest.name}</strong><small>{[guest.category,guest.contact].filter(Boolean).join(' · ')||'Guest group'}</small></span>{guest.id===guestId&&<Check size={15}/>}</button>):<p>No matching guest groups. Use the name above for this room only.</p>}</div></div>}
  {error&&<p id={id+'-error'} className="field-error">{error}</p>}
 </div>;
}
function PlusName(){return <UserRound size={17} aria-hidden="true"/>;}
