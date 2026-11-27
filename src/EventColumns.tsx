import {useEffect,useId,useState} from 'react';
import {Columns3} from 'lucide-react';
import {type WeddingEvent} from './data';
import {eventLifecycle,selectedEventColumns,type EventColumnPreferences,type EventDisplayMode} from './attendance';
import {usePreferenceKey} from './weddingScope';

export function useEventColumns(events:WeddingEvent[]){
 const key=usePreferenceKey('guestEventColumns');
 const [preferences,setPreferences]=useState<EventColumnPreferences>(()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&['all','active','completed','custom'].includes(value.preset)&&Array.isArray(value.ids)&&value.ids.every((id:unknown)=>typeof id==='string')&&['auto','rsvp','attendance'].includes(value.mode))return value;}catch{/* Start with every event. */}return {preset:'all',ids:[],mode:'auto'};});
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(preferences));}catch{/* View selection still works in memory. */}},[key,preferences]);
 return {preferences,setPreferences,columns:selectedEventColumns(events,preferences)};
}
export function EventColumnControls({events,preferences,onChange}:{events:WeddingEvent[];preferences:EventColumnPreferences;onChange:(value:EventColumnPreferences)=>void}){
 const id=useId(),columns=selectedEventColumns(events,preferences);
 return <div className="event-column-controls"><details className="event-column-picker"><summary className="button secondary"><Columns3 size={15}/>Events shown <span>{columns.length}</span></summary><div className="event-column-options"><strong>Choose event columns</strong><p>This changes columns, not your guest filters.</p><label>Show events<select value={preferences.preset} onChange={e=>onChange({...preferences,preset:e.target.value as EventColumnPreferences['preset']})}><option value="all">All events</option><option value="active">Active events</option><option value="completed">Completed events</option><option value="custom">Custom selection</option></select></label><div className="event-column-checks">{selectedEventColumns(events,{preset:'all',ids:[],mode:'auto'}).map(event=><label key={event.id}><input type="checkbox" checked={columns.some(column=>column.id===event.id)} onChange={e=>{const ids=columns.map(column=>column.id);onChange({...preferences,preset:'custom',ids:e.target.checked?[...ids,event.id]:ids.filter(value=>value!==event.id)});}}/><span><strong>{event.name}</strong><small>{new Date(event.date+'T12:00:00').toLocaleDateString()} · {eventLifecycle(event)}</small></span></label>)}</div>{!events.length&&<p>No events have been created yet.</p>}<button type="button" className="text-link" onClick={()=>onChange({...preferences,preset:'custom',ids:[]})}>Hide all event columns</button></div></details><label className="event-matrix-mode" htmlFor={id}>Show<select id={id} value={preferences.mode} onChange={e=>onChange({...preferences,mode:e.target.value as EventDisplayMode})}><option value="auto">Auto</option><option value="rsvp">RSVP</option><option value="attendance">Attendance</option></select></label></div>;
}
