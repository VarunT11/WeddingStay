import {useState,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {ChevronDown,Settings,LogOut,ArrowLeftRight,X} from 'lucide-react';
import {useCloud} from './CloudAccess';
import {useNavigate} from './navigation';
import {useDialog} from './dialogs';

export function WeddingSelector({disabled=false,mobile=false}:{disabled?:boolean;mobile?:boolean}){
 const cloud=useCloud(),[open,setOpen]=useState(false),navigate=useNavigate();
 return <div className={mobile?'wedding-selector mobile-wedding-selector':'wedding-selector desktop-wedding-selector'}><button className="wedding-selector-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><span><small>CURRENT WEDDING</small><strong>{cloud.snapshot.data.wedding.name}</strong></span><ChevronDown size={16}/></button>{open&&<NavigationSheet title={cloud.snapshot.data.wedding.name} onClose={()=>setOpen(false)}><button onClick={()=>{flushSync(()=>setOpen(false));cloud.chooseWedding();}}><ArrowLeftRight size={18}/>Your weddings</button><button onClick={()=>{setOpen(false);navigate('/settings');}}><Settings size={18}/>Wedding settings</button></NavigationSheet>}</div>;
}
export function AccountMenu({disabled=false,mobile=false}:{disabled?:boolean;mobile?:boolean}){
 const cloud=useCloud(),[open,setOpen]=useState(false),name=cloud.user.displayName||cloud.user.email||'Your account';
 const initials=name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
 return <div className={mobile?'account-control mobile-account-control':'account-control desktop-account-control'}><button className="account-trigger" disabled={disabled} aria-label={'Account: '+name} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><span className="account-initials">{initials}</span><span className="account-copy"><strong>{name}</strong><small>{cloud.role==='owner'?'App owner':'Member'}</small></span></button>{open&&<NavigationSheet title="Your account" onClose={()=>setOpen(false)}><div className="account-details"><strong>{name}</strong><span>{cloud.user.email}</span><small>{cloud.role==='owner'?'App owner · All weddings':'Wedding member'}</small></div><button onClick={()=>{flushSync(()=>setOpen(false));void cloud.signOut();}}><LogOut size={18}/>Sign out</button></NavigationSheet>}</div>;
}
function NavigationSheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useDialog(onClose);
 return <div className="navigation-sheet-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="navigation-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="navigation-sheet-heading"><strong>{title}</strong><button className="icon-button" aria-label="Close menu" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
