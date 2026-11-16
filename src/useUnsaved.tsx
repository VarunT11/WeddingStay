import {useEffect,useRef,useState} from 'react';
import {useBlocker} from 'react-router-dom';
import {Confirm} from './dialogs';
export function useUnsaved(dirty:boolean) {
 const allow=useRef(false),[action,setAction]=useState<(()=>void)|null>(null),blocker=useBlocker(()=>dirty&&!allow.current);
 useEffect(()=>{allow.current=false;});
 useEffect(()=>{if(!dirty)allow.current=false;const handler=(e:BeforeUnloadEvent)=>{if(dirty)e.preventDefault();};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 return {permit:()=>{allow.current=true;},request:(fn:()=>void)=>{if(dirty)setAction(()=>fn);else fn();},confirmation:<>{action&&<Confirm title="Discard unsaved changes?" text="Your latest edits have not been saved." action="Discard changes" onCancel={()=>setAction(null)} onConfirm={()=>{const fn=action;setAction(null);allow.current=true;fn();}}/>}{blocker.state==='blocked'&&<Confirm title="Discard unsaved changes?" text="Your latest edits have not been saved." action="Discard changes" onCancel={()=>blocker.reset()} onConfirm={()=>blocker.proceed()}/>}</>};
}
