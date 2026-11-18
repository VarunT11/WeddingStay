import {useEffect,useRef,useState} from 'react';
import {useBlocker,useLocation} from 'react-router-dom';
import {Confirm} from './dialogs';
export function useUnsaved(dirty:boolean) {
 const location=useLocation(),allow=useRef<{from:string;to?:string}|null>(null),[action,setAction]=useState<(()=>void)|null>(null),pendingAction=useRef<(()=>void)|null>(null),executing=useRef(false);
 const blocker=useBlocker(({currentLocation,nextLocation})=>{
  if(!dirty)return false;
  const permission=allow.current;
  if(permission?.from===currentLocation.key&&(!permission.to||permission.to===nextLocation.key)){permission.to=nextLocation.key;return false;}
  return true;
 });
 // A discard may navigate asynchronously. Keep its permission through intervening renders.
 useEffect(()=>{allow.current=null;},[location.key]);
 useEffect(()=>{if(dirty)allow.current=null;},[dirty]);
 useEffect(()=>{if(blocker.state==='blocked'){pendingAction.current=null;setAction(null);}},[blocker.state]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty)e.preventDefault();};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 function permit(){allow.current={from:location.key};}
 function request(fn:()=>void){
  if(executing.current||blocker.state==='blocked')return;
  if(dirty){pendingAction.current=fn;setAction(()=>fn);}else fn();
 }
 function discard(){
  const fn=pendingAction.current;if(!fn||executing.current)return;
  pendingAction.current=null;executing.current=true;setAction(null);permit();
  try{fn();}finally{executing.current=false;}
 }
 const confirmation=blocker.state==='blocked'?<Confirm title="Discard unsaved changes?" text="Your latest edits have not been saved." action="Discard changes" onCancel={()=>{allow.current=null;blocker.reset();}} onConfirm={()=>blocker.proceed()}/>:action?<Confirm title="Discard unsaved changes?" text="Your latest edits have not been saved." action="Discard changes" onCancel={()=>{pendingAction.current=null;setAction(null);}} onConfirm={discard}/>:null;
 return {permit,request,confirmation};
}
