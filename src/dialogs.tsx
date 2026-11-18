import {useEffect,useRef} from 'react';
import {CircleHelp} from 'lucide-react';

let openDialogs=0;
let bodyOverflowBeforeDialogs='';
export function useDialog(onClose:()=>void,enabled=true,lockScroll=true) {
 const ref=useRef<HTMLDivElement>(null);const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{if(!enabled)return;const previous=document.activeElement as HTMLElement|null;const el=ref.current;if(lockScroll&&openDialogs++===0){bodyOverflowBeforeDialogs=document.body.style.overflow;document.body.style.overflow='hidden';}el?.focus();function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();} if(e.key==='Tab'&&el){const controls=Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(n=>n.offsetParent!==null);const first=controls[0],last=controls[controls.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===el)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===el)){e.preventDefault();first.focus();}}} el?.addEventListener('keydown',key);return()=>{if(lockScroll&&--openDialogs===0)document.body.style.overflow=bodyOverflowBeforeDialogs;el?.removeEventListener('keydown',key);previous?.focus();};},[enabled,lockScroll]);
 return ref;
}
export function Confirm({title,text,action,onCancel,onConfirm}: {title:string;text:string;action:string;onCancel:()=>void;onConfirm:()=>void}) {const ref=useDialog(onCancel);return <div className="confirm-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}><div ref={ref} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabIndex={-1}><span className="confirm-icon"><CircleHelp/></span><h2 id="confirm-title">{title}</h2><p>{text}</p><div className="confirm-actions"><button className="button secondary" onClick={onCancel}>Keep as is</button><button className="button primary" onClick={onConfirm}>{action}</button></div></div></div>;}
