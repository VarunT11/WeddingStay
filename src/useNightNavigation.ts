import {useLayoutEffect,useRef} from 'react';
import {useLocation,useNavigationType} from 'react-router-dom';
import {parseStayRoute} from './stayRoutes';

// Only the night overview and returns from it participate. Room overlays keep their own restoration.
export function useNightNavigation(){
 const location=useLocation(),navigationType=useNavigationType(),entry=useRef(location),positions=useRef(new Map<string,number>()),initial=useRef(true),pending=useRef<{pathname:string;scroll?:number;focus:boolean}|null>(null);
 useLayoutEffect(()=>{
  const previous=entry.current,first=initial.current;initial.current=false;
  const from=parseStayRoute(previous.pathname),to=parseStayRoute(location.pathname);
  if(previous.key!==location.key&&previous.pathname===location.pathname)positions.current.set(location.key,positions.current.get(previous.key)??window.scrollY);
  entry.current=location;
  const relevant=first?to.kind==='night':previous.pathname!==location.pathname&&(to.kind==='night'||from.kind==='night');
  if(relevant){const saved=navigationType==='POP'?positions.current.get(location.key):undefined;pending.current={pathname:location.pathname,scroll:saved,focus:to.kind==='night'&&saved===undefined};}
  else if(pending.current?.pathname!==location.pathname)pending.current=null;
  let frame:number|undefined;
  if(pending.current){frame=requestAnimationFrame(()=>{
   const target=pending.current;if(!target||target.pathname!==location.pathname)return;
   if(target.focus)document.getElementById('night-overview-title')?.focus({preventScroll:true});
   window.scrollTo({top:target.scroll??0,left:0,behavior:'instant'});pending.current=null;
  });}
  function remember(){positions.current.set(location.key,window.scrollY);if(positions.current.size>100)positions.current.delete(positions.current.keys().next().value!);}
  window.addEventListener('scroll',remember,{passive:true});
  return()=>{window.removeEventListener('scroll',remember);if(frame!==undefined)cancelAnimationFrame(frame);};
 },[location.key,location.pathname,navigationType]);
}
