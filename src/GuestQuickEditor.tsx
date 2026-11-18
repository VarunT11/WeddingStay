import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from './dialogs';
import './guest-matrix.css';

export function GuestEditorError({message}:{message:string}){const ref=useRef<HTMLParagraphElement>(null);useEffect(()=>{ref.current?.focus();},[message]);return <p ref={ref} className="field-error" role="alert" tabIndex={-1}>{message}</p>;}

export function visibleGuestControl(attribute:string,id:string){
 return Array.from(document.querySelectorAll<HTMLElement>('['+attribute+']')).find(element=>element.getAttribute(attribute)===id&&element.getClientRects().length>0)||null;
}
export function restoreGuestControl(attribute:string,id:string){
 const target=visibleGuestControl(attribute,id)||document.querySelector<HTMLElement>('.guest-list-toolbar input,.event-guest-toolbar input');
 target?.focus();
}
export function restoreGuestRow(id:string,following:string[]=[]){
 requestAnimationFrame(()=>{
  const controls=Array.from(document.querySelectorAll<HTMLElement>('[data-guest-open-id]')).filter(el=>el.getClientRects().length>0);
  const target=[id,...following].map(key=>controls.find(el=>el.dataset.guestOpenId===key)).find(Boolean)||document.querySelector<HTMLElement>('.guest-list-toolbar input,.event-guest-toolbar input');
  target?.focus({preventScroll:true});
 });
}
export function GuestQuickEditor({titleId,anchorAttribute,anchorId,modal=false,onClose,children}:{titleId:string;anchorAttribute:string;anchorId:string;modal?:boolean;onClose:()=>void;children:ReactNode}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 767px)').matches);
 const [position,setPosition]=useState<{left:number;top:number;floating:boolean}>({left:0,top:0,floating:false});
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const floating=!mobile&&!modal&&position.floating;
 const ref=useDialog(()=>closeRef.current(),true,!floating);
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)'),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useLayoutEffect(()=>{
  function place(){
   const element=ref.current,anchor=visibleGuestControl(anchorAttribute,anchorId);
   if(!element||mobile||modal||!anchor){setPosition(previous=>previous.floating?{...previous,floating:false}:previous);return;}
   const rect=anchor.getBoundingClientRect(),width=element.offsetWidth,height=element.offsetHeight;
   const left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));
   const desired=rect.bottom+8+height<=window.innerHeight-12?rect.bottom+8:rect.top-height-8;
   const top=Math.max(12,Math.min(desired,window.innerHeight-height-12));
   setPosition(previous=>previous.left===left&&previous.top===top&&previous.floating?previous:{left,top,floating:true});
  }
  place();const observer=new ResizeObserver(place);if(ref.current)observer.observe(ref.current);
  window.addEventListener('scroll',place,true);window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);
  return()=>{observer.disconnect();window.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);};
 },[anchorAttribute,anchorId,mobile,modal,ref]);
 useEffect(()=>{
  if(!floating)return;
  function outside(event:MouseEvent){const target=event.target as Element|null;if(!target||ref.current?.contains(target)||target.closest('.confirm-overlay'))return;event.preventDefault();event.stopPropagation();closeRef.current();}
  document.addEventListener('click',outside,true);return()=>document.removeEventListener('click',outside,true);
 },[floating,ref]);
 return createPortal(<div className={'guest-quick-layer '+(floating?'is-floating':mobile?'is-sheet':'is-dialog')} onMouseDown={event=>{if(event.target===event.currentTarget&&!floating)closeRef.current();}}><div ref={ref} className={'guest-quick-editor '+(floating?'guest-quick-popover':mobile?'guest-quick-sheet':'guest-quick-dialog')} style={floating?{left:position.left,top:position.top}:undefined} role="dialog" aria-modal={floating?undefined:true} aria-labelledby={titleId} tabIndex={-1}>{children}</div></div>,document.body);
}
