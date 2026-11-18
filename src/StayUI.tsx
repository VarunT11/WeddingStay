import {useEffect,useId,useRef,useState} from 'react';
import {type GuestGroup} from './model';
export const stayStatus=(value:string)=>value==='Allotted'?'Reserved':value==='Occupied'?'Checked in':value==='active'?'Reserved':value==='completed'?'Checked out':value==='cancelled'?'Cancelled':value;
export function StayError({message}:{message:string}){const ref=useRef<HTMLParagraphElement>(null);useEffect(()=>{ref.current?.focus();},[message]);return <p ref={ref} tabIndex={-1} className="field-error" role="alert">{message}</p>;}
export function stayDate(date:string,year=false){return date?new Date(date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',...(year?{year:'numeric' as const}:{})}):'—';}
export function stayDates(checkIn?:string,checkOut?:string){
 if(!checkIn||!checkOut)return 'Dates not recorded';
 const nights=Math.round((Date.parse(checkOut+'T12:00:00Z')-Date.parse(checkIn+'T12:00:00Z'))/86400000);
 const crossesYear=checkIn.slice(0,4)!==checkOut.slice(0,4);
 return `${stayDate(checkIn,crossesYear)}–${stayDate(checkOut,true)}${nights>0?` · ${nights} ${nights===1?'night':'nights'}`:''}`;
}
export function GuestPicker({guests,value,onChange,label='Guest group',empty='No guest group'}:{guests:GuestGroup[];value:string;onChange:(value:string)=>void;label?:string;empty?:string}){
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),id=useId(),toggle=useRef<HTMLButtonElement>(null),selected=guests.find(g=>g.id===value);
 const matches=guests.filter(g=>[g.name,g.contact,g.category,...g.members].some(s=>s.toLowerCase().includes(query.trim().toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name));
 return <div className="stay-guest-picker" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);toggle.current?.focus();}}}><span className="stay-field-label" id={id}>{label}</span><button type="button" className="stay-picker-toggle" ref={toggle} aria-label={label+': '+(selected?.name||empty)} aria-expanded={open} aria-controls={id+'-choices'} onClick={()=>setOpen(!open)}>{selected?.name||empty}<span>{open?'Close':'Choose'}</span></button>{open&&<div className="stay-picker-choices" id={id+'-choices'}><input autoFocus aria-label={'Search '+label.toLowerCase()} type="search" placeholder="Name, category or phone…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="stay-picker-results"><button type="button" aria-pressed={!value} onClick={()=>{onChange('');setOpen(false);setQuery('');toggle.current?.focus();}}>{empty}</button>{matches.map(g=><button type="button" aria-pressed={g.id===value} key={g.id} onClick={()=>{onChange(g.id);setOpen(false);setQuery('');toggle.current?.focus();}}><strong>{g.name}</strong><small>{[g.category,g.contact,g.headcount===null?'Guest count unknown':g.headcount+' guests'].filter(Boolean).join(' · ')}</small></button>)}{!matches.length&&<p role="status">No matching guest groups.</p>}</div></div>}</div>;
}
