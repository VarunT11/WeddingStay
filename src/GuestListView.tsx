import {usePreferenceKey} from './weddingScope';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {List,Table2} from 'lucide-react';
import './guest-mobile-view.css';

export type GuestMobileView='matrix'|'list';
type ListContext='master'|'event';
const storageKey=(context:ListContext)=>'weddingstay.guestListMobileView.'+context;
function readView(key:string):GuestMobileView{
 try{const value=localStorage.getItem(key);if(value==='matrix'||value==='list')return value;if(value==='cards')return 'list';}catch{/* Storage is optional. */}
 return 'list';
}
export function useGuestMobileView(context:ListContext){
 const masterKey=usePreferenceKey(storageKey('master')),eventKey=usePreferenceKey(storageKey('event'));
 const [views,setViews]=useState(()=>({master:readView(masterKey),event:readView(eventKey)}));
 function changeView(view:GuestMobileView){setViews(previous=>({...previous,[context]:view}));try{localStorage.setItem(context==='master'?masterKey:eventKey,view);}catch{/* Keep the selection for this session. */}}
 return [views[context],changeView] as const;
}
export function useGuestListMobile(){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 767px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 return mobile;
}
export function MobileGuestViewSwitch({value,onChange}:{value:GuestMobileView;onChange:(value:GuestMobileView)=>void}){
 return <div className="guest-mobile-view-switch" role="group" aria-label="Mobile guest list view"><button type="button" aria-pressed={value==='matrix'} onClick={()=>onChange('matrix')}><Table2 size={16} aria-hidden="true"/>Matrix</button><button type="button" aria-pressed={value==='list'} onClick={()=>onChange('list')}><List size={16} aria-hidden="true"/>List</button></div>;
}

export function useGuestListScroll(matrix:RefObject<HTMLDivElement|null>,cards:RefObject<HTMLDivElement|null>,mobile:boolean,view:GuestMobileView,resetKey:string){
 const mode=mobile?view:'matrix';
 const positions=useRef({matrix:{x:0,y:0,pageY:window.scrollY},list:{pageY:window.scrollY}});
 const previous=useRef({mode,resetKey}),restoring=useRef(false);
 useLayoutEffect(()=>{
  restoring.current=true;
  if(previous.current.resetKey!==resetKey){
   const element=mode==='list'?cards.current:matrix.current;
   const toolbar=document.querySelector<HTMLElement>('.guest-list-toolbar,.event-guest-toolbar');
   const listTop=Math.max(0,(element?.getBoundingClientRect().top||0)+window.scrollY-(toolbar?.offsetHeight||0)-12);
   positions.current={matrix:{x:0,y:0,pageY:window.scrollY},list:{pageY:listTop}};
   matrix.current?.scrollTo({left:0,top:0});
   if(mode==='list')window.scrollTo({top:listTop});
  }else if(previous.current.mode!==mode){
   if(mode==='matrix')matrix.current?.scrollTo({left:positions.current.matrix.x,top:positions.current.matrix.y});
   window.scrollTo({top:positions.current[mode].pageY});
  }
  previous.current={mode,resetKey};
  const frame=requestAnimationFrame(()=>{restoring.current=false;});
  return()=>cancelAnimationFrame(frame);
 },[mode,resetKey,matrix,cards]);
 useEffect(()=>{
  const element=matrix.current;
  function pageScroll(){if(!restoring.current)positions.current[mode].pageY=window.scrollY;}
  function matrixScroll(){if(restoring.current||mode!=='matrix'||!element)return;positions.current.matrix={x:element.scrollLeft,y:element.scrollTop,pageY:window.scrollY};}
  window.addEventListener('scroll',pageScroll,{passive:true});element?.addEventListener('scroll',matrixScroll,{passive:true});
  return()=>{window.removeEventListener('scroll',pageScroll);element?.removeEventListener('scroll',matrixScroll);};
 },[mode,matrix]);
}
