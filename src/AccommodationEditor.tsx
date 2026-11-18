import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {type Dataset,type GuestGroup} from './data';
import {updateGuestAccommodation} from './management';
import {Confirm,useDialog} from './dialogs';
import './accommodation.css';
import {GuestQuickEditor,GuestEditorError} from './GuestQuickEditor';

type Props={guestId:string;data:Dataset;fromProfile:boolean;commit:(data:Dataset,message:string)=>Promise<boolean>;onClose:()=>void;onDirty:(dirty:boolean)=>void;restoreFocus:()=>void};
export function AccommodationEditor(props:Props){
 const guest=props.data.guests.find(item=>item.id===props.guestId);
 return guest?<AccommodationDraft key={guest.id} {...props} guest={guest}/>:<MissingGuest onClose={props.onClose}/>;
}
function MissingGuest({onClose}:{onClose:()=>void}){
 const ref=useDialog(onClose);
 return createPortal(<div className="accommodation-overlay"><div className="accommodation-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="accommodation-missing-title" tabIndex={-1}><div className="accommodation-content"><h2 id="accommodation-missing-title">Guest group unavailable</h2><p>This guest group no longer exists. Close this editor and review the latest guest list.</p><button className="button secondary" onClick={onClose}>Close</button></div></div></div>,document.body);
}
function AccommodationDraft({guest,data,fromProfile,commit,onClose,onDirty,restoreFocus}:Props&{guest:GuestGroup}){
 const base=useRef({needsAccommodation:guest.needsAccommodation,headcount:guest.headcount}).current;
 const [need,setNeed]=useState(base.needsAccommodation===null?'unknown':base.needsAccommodation?'yes':'no'),[count,setCount]=useState(base.headcount===null?'':String(base.headcount));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
 const values={needsAccommodation:need==='unknown'?null:need==='yes',headcount:count.trim()===''?null:Number(count)};
 const dirty=values.needsAccommodation!==base.needsAccommodation||values.headcount!==base.headcount;
 const countError=values.headcount===null?'':!Number.isInteger(values.headcount)||values.headcount<0?'Enter a non-negative whole number, or leave blank if unknown.':values.headcount<guest.members.length?'Expected guests must be at least '+guest.members.length+' to cover the named members.':'';
 const callbacks=useRef({onClose,onDirty,restoreFocus});callbacks.current={onClose,onDirty,restoreFocus};
 function close(){if(busy)return;if(dirty)setDiscard(true);else onClose();}
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 useEffect(()=>()=>{requestAnimationFrame(()=>callbacks.current.restoreFocus());},[]);

 async function save(){if(busy||!dirty||countError)return;setBusy(true);setError('');try{const next=updateGuestAccommodation(data,guest.id,values);if(await commit(next,'Accommodation and expected guest count updated')){onDirty(false);onClose();}else setError('Could not save. Your accommodation details are kept here; reconnect or review the latest data before retrying.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not save accommodation details.');}finally{setBusy(false);}}
 const activeStays=data.allocations.filter(stay=>stay.guestGroupId===guest.id&&stay.lifecycle==='active').length;
 const editor=<GuestQuickEditor titleId="accommodation-editor-title" anchorAttribute="data-guest-stay-id" anchorId={guest.id} modal={fromProfile} onClose={close}>
 <header className="guest-quick-header"><h2 id="accommodation-editor-title">Edit stay needs</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close accommodation editor" onClick={close}><X size={19}/></button></header>
 <form id="guest-accommodation-form" className="guest-quick-content" onSubmit={event=>{event.preventDefault();void save();}}>
 <div className="accommodation-identity"><strong>{guest.name}</strong><p>{guest.category||'Uncategorised'}</p></div>
 <label>Stay needs<select value={need} disabled={busy} onChange={event=>setNeed(event.target.value)}><option value="unknown">Not sure yet</option><option value="yes">Needs rooms</option><option value="no">No rooms needed</option></select></label>
 <label>Expected guests — whole group<input type="number" min={0} step={1} value={count} disabled={busy} placeholder="Unknown" aria-invalid={!!countError} aria-describedby={countError?'accommodation-count-error':'accommodation-count-help'} onChange={event=>setCount(event.target.value)}/><small id="accommodation-count-help">Leave blank if unknown.</small></label>
 {countError&&<p className="field-error" role="alert" id="accommodation-count-error">{countError}</p>}
 <p className="accommodation-help">These details apply to this guest group across all events. Expected guests are separate from confirmed event attendance.</p>
 {need==='no'&&activeStays>0&&<p className="accommodation-linked-note">{activeStays} active {activeStays===1?'stay remains':'stays remain'} linked. This update does not cancel or release rooms.</p>}
 {error&&<GuestEditorError message={error}/>}
 </form><footer className="guest-quick-actions"><button type="submit" form="guest-accommodation-form" className="button primary" disabled={busy||!dirty||!!countError}>{busy?'Saving…':'Save changes'}</button><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button></footer>
 </GuestQuickEditor>;
 return <>{editor}{discard&&createPortal(<Confirm title="Discard accommodation changes?" text="Your accommodation need and expected guest count have not been saved." action="Discard changes" onCancel={()=>setDiscard(false)} onConfirm={()=>{onDirty(false);onClose();}}/>,document.body)}</>;
}
