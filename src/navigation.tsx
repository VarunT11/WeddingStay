import {WeddingScopeContext} from './weddingScope';
import {createContext,useContext,type ComponentProps} from 'react';
import {Link as RouterLink,NavLink as RouterNavLink,useNavigate as routerNavigate,type To,type NavigateOptions} from 'react-router-dom';
import {parseStayRoute} from './stayRoutes';
export const DateContext=createContext('');
export function dated(to:To,date:string,weddingId?:string):To {
 if(typeof to==='number')return to;
 if(typeof to==='string'){
  if(/^(https?:|tel:|mailto:|#)/.test(to))return to;
  const [base,hash]=to.split('#'),[pathname,query]=base.split('?'),p=new URLSearchParams(query),pathDate=parseStayRoute(pathname).date;if(weddingId)p.set('wedding',weddingId);if(pathDate)p.set('date',pathDate);else if(date&&!p.has('date'))p.set('date',date);
  return pathname+'?'+p.toString()+(hash?'#'+hash:'');
 }
 const p=new URLSearchParams(to.search),pathDate=to.pathname?parseStayRoute(to.pathname).date:undefined;if(weddingId)p.set('wedding',weddingId);if(pathDate)p.set('date',pathDate);else if(date&&!p.has('date'))p.set('date',date);return {...to,search:p.toString()};
}
export function Link(props:ComponentProps<typeof RouterLink>){const date=useContext(DateContext),scope=useContext(WeddingScopeContext);return <RouterLink {...props} to={dated(props.to,date,scope?.weddingId)}/>;}
export function NavLink(props:ComponentProps<typeof RouterNavLink>){const date=useContext(DateContext),scope=useContext(WeddingScopeContext);return <RouterNavLink {...props} to={dated(props.to,date,scope?.weddingId)}/>;}
export function useNavigate(){const navigate=routerNavigate(),date=useContext(DateContext),scope=useContext(WeddingScopeContext);return ((to:To|number,options?:NavigateOptions)=>typeof to==='number'?navigate(to):navigate(dated(to,date,scope?.weddingId),options)) as ReturnType<typeof routerNavigate>;}
