import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {type Dataset,type Invitation} from './data';
import {deleteInvitation,saveInvitation,updateGuestEvents} from './management';
import {Confirm} from './dialogs';
import {GuestQuickEditor,GuestEditorError,restoreGuestControl} from './GuestQuickEditor';

type Commit=(data:Dataset,message:string)=>Promise<boolean>;
type Shared={data:Dataset;commit:Commit;onClose:()=>void;onDirty:(dirty:boolean)=>void};
export function RsvpEditor({invitation,data,commit,onClose,onDirty,modal=false,onSaved}:{invitation:Invitation;modal?:boolean;onSaved?:()=>void}&Shared){
 const base=useRef(invitation).current,latest=useRef(data);latest.current=data;
 const [response,setResponse]=useState(base.response),[count,setCount]=useState(base.confirmedHeadcount===null?'':String(base.confirmedHeadcount)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false),[removing,setRemoving]=useState(false);
 const titleId=useId(),formId=useId(),saving=useRef(false),origin=useRef(document.activeElement as HTMLElement|null);
 const dirty=response!==base.response||count!==(base.confirmedHeadcount===null?'':String(base.confirmedHeadcount));
 const countError=response==='Confirmed'&&count.trim()!==''&&(!Number.isInteger(Number(count))||Number(count)<0)?'Enter a whole number of zero or more, or leave blank if unknown.':'';
 const guest=data.guests.find(g=>g.id===base.guestGroupId),event=data.events.find(e=>e.id===base.eventId);
 function close(){if(saving.current)return;if(dirty)setDiscard(true);else onClose();}
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 useEffect(()=>()=>{if(!onSaved)requestAnimationFrame(()=>{if(modal&&origin.current?.isConnected)origin.current.focus({preventScroll:true});else restoreGuestControl('data-guest-rsvp-id',base.id);});},[base.id,onSaved,modal]);
 async function save(remove=false){
  if(saving.current||(!remove&&countError))return;saving.current=true;setBusy(true);setError('');
  try{
   if(!latest.current.invitations.some(i=>i.id===base.id))throw new Error('This invitation no longer exists. Close this editor to refresh the list.');
   const next=remove?deleteInvitation(latest.current,base.id):saveInvitation(latest.current,{...base,response,confirmedHeadcount:response==='Confirmed'&&count.trim()!==''?Number(count):null});
   if(await commit(next,remove?'Invitation removed':'RSVP saved')){onDirty(false);onClose();onSaved?.();}
   else setError('Could not save. Your changes are kept here.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save.');}
  finally{saving.current=false;setBusy(false);setRemoving(false);}
 }
 return <><GuestQuickEditor titleId={titleId} anchorAttribute="data-guest-rsvp-id" anchorId={base.id} modal={modal} onClose={close}>
  <header className="guest-quick-header"><h2 id={titleId}>Update RSVP</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close RSVP editor" onClick={close}><X size={19}/></button></header>
  <form id={formId} className="guest-quick-content" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="guest-quick-context"><strong>{guest?.name}</strong><p>{event?.name}</p><p>{guest?.headcount==null?'Expected count unknown':guest.headcount+' expected guests'}</p></div>
   <fieldset className="guest-response-choices" disabled={busy}><legend>Response</legend>{(['Pending','Confirmed','Declined'] as const).map(value=><button type="button" key={value} aria-pressed={response===value} onClick={()=>{setResponse(value);if(value!=='Confirmed')setCount('');}}>{value}</button>)}</fieldset>
   {response==='Confirmed'&&<label>Confirmed guests<input type="number" inputMode="numeric" min={0} step={1} placeholder="Unknown" value={count} disabled={busy} aria-invalid={!!countError} onChange={e=>setCount(e.target.value)}/><small>Leave blank if unknown.</small></label>}
   {countError&&<p className="field-error" role="alert">{countError}</p>}{error&&<GuestEditorError message={error}/>}
   <details className="guest-editor-more"><summary>Invitation options</summary><button type="button" className="quiet-button danger" disabled={busy} onClick={()=>setRemoving(true)}>Remove invitation</button></details>
  </form>
  <div className="guest-quick-actions"><button type="submit" form={formId} className="button primary" disabled={busy||!!countError}>{busy?'Saving…':'Save RSVP'}</button><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button></div>
 </GuestQuickEditor>
 {discard&&createPortal(<Confirm title="Discard unsaved RSVP?" text="Your response has not been saved." action="Discard changes" onCancel={()=>setDiscard(false)} onConfirm={()=>{onDirty(false);onClose();}}/>,document.body)}
 {removing&&createPortal(<Confirm title="Remove invitation?" text={'Remove '+guest?.name+' from '+event?.name+'? Its saved RSVP will also be removed. The guest group and stays will be kept.'} action={busy?'Removing…':'Remove invitation'} onCancel={()=>{if(!busy)setRemoving(false);}} onConfirm={()=>void save(true)}/>,document.body)}
 </>;
}

export function GuestEventsEditor({guestId,addEventId,data,commit,onClose,onDirty,onSaved}:{guestId:string;addEventId?:string;onSaved?:()=>void}&Shared){
 const initial=useRef(data.invitations.filter(i=>i.guestGroupId===guestId).map(i=>i.eventId)).current;
 const [selected,setSelected]=useState(()=>[...new Set([...initial,...(addEventId?[addEventId]:[])])]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false),[confirm,setConfirm]=useState(false);
 const latest=useRef(data);latest.current=data;const saving=useRef(false),titleId=useId(),formId=useId(),origin=useRef(document.activeElement as HTMLElement|null);
 const dirty=selected.length!==initial.length||selected.some(id=>!initial.includes(id));
 useEffect(()=>()=>{requestAnimationFrame(()=>{if(origin.current?.isConnected&&origin.current.getClientRects().length)origin.current.focus({preventScroll:true});else restoreGuestControl('data-guest-events-id',guestId);});},[guestId]);
 const guest=data.guests.find(g=>g.id===guestId),events=[...data.events].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))||a.name.localeCompare(b.name));
 const removed=data.invitations.filter(i=>i.guestGroupId===guestId&&initial.includes(i.eventId)&&!selected.includes(i.eventId));
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 function close(){if(saving.current)return;if(dirty)setDiscard(true);else onClose();}
 async function save(approved=false){
  if(saving.current)return;if(removed.length&&!approved){setConfirm(true);return;}
  saving.current=true;setBusy(true);setError('');
  try{
   // Apply only membership edits made in this draft, retaining concurrent additions.
   const additions=selected.filter(id=>!initial.includes(id)),removals=initial.filter(id=>!selected.includes(id));
   const current=latest.current.invitations.filter(i=>i.guestGroupId===guestId).map(i=>i.eventId);
   const nextIds=[...new Set([...current.filter(id=>!removals.includes(id)),...additions])];
   if(await commit(updateGuestEvents(latest.current,guestId,nextIds),'Event invitations saved')){onDirty(false);onClose();onSaved?.();}
   else setError('Could not save. Your selection is kept here.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save event invitations.');}
  finally{saving.current=false;setBusy(false);setConfirm(false);}
 }
 return <><GuestQuickEditor titleId={titleId} anchorAttribute="data-guest-events-id" anchorId={guestId} modal onClose={close}>
  <header className="guest-quick-header"><h2 id={titleId}>Edit events</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close event selection" onClick={close}><X size={19}/></button></header>
  <form id={formId} className="guest-quick-content" onSubmit={e=>{e.preventDefault();void save();}}><div className="guest-quick-context"><strong>{guest?.name}</strong><p>Select the events this family is invited to. New invitations start as Pending.</p></div>
   <fieldset className="guest-event-membership" disabled={busy}><legend className="sr-only">Event invitations</legend>{events.map(event=>{const invitation=data.invitations.find(i=>i.guestGroupId===guestId&&i.eventId===event.id);return <label key={event.id}><input type="checkbox" checked={selected.includes(event.id)} onChange={e=>setSelected(e.target.checked?[...selected,event.id]:selected.filter(id=>id!==event.id))}/><span><strong>{event.name}</strong><small>{new Date(event.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}{invitation?' · '+invitation.response+(invitation.response==='Confirmed'?' · '+(invitation.confirmedHeadcount===null?'Count needed':invitation.confirmedHeadcount+' confirmed'):''):''}</small></span></label>;})}</fieldset>
   {!events.length&&<p>No events yet. Create an event before adding invitations.</p>}{error&&<GuestEditorError message={error}/>}
  </form><div className="guest-quick-actions"><button type="submit" form={formId} className="button primary" disabled={busy||!dirty||!events.length}>{busy?'Saving…':'Save events'}</button><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button></div>
 </GuestQuickEditor>
 {discard&&createPortal(<Confirm title="Discard event changes?" text="Your event selections have not been saved." action="Discard changes" onCancel={()=>setDiscard(false)} onConfirm={()=>{onDirty(false);onClose();}}/>,document.body)}
 {confirm&&createPortal(<Confirm title="Remove event invitations?" text={'Remove invitations for '+removed.map(i=>data.events.find(e=>e.id===i.eventId)?.name).join(', ')+'. Saved responses and confirmed counts for these events will also be removed.'} action={busy?'Saving…':'Save and remove'} onCancel={()=>{if(!busy)setConfirm(false);}} onConfirm={()=>void save(true)}/>,document.body)}
 </>;
}
