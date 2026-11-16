import {createContext,useContext,type ComponentProps} from 'react';
import {Link as RouterLink,NavLink as RouterNavLink,useNavigate as routerNavigate,type To,type NavigateOptions} from 'react-router-dom';
import {parseStayRoute} from './stayRoutes';
export const DateContext=createContext('');
export function dated(to:To,date:string):To {
 if(!date||typeof to==='number')return to;
 if(typeof to==='string'){
  if(/^(https?:|tel:|mailto:|#)/.test(to))return to;
  const [base,hash]=to.split('#'),[pathname,query]=base.split('?'),p=new URLSearchParams(query),pathDate=parseStayRoute(pathname).date;if(pathDate)p.set('date',pathDate);else if(!p.has('date'))p.set('date',date);
  return pathname+'?'+p.toString()+(hash?'#'+hash:'');
 }
 const p=new URLSearchParams(to.search),pathDate=to.pathname?parseStayRoute(to.pathname).date:undefined;if(pathDate)p.set('date',pathDate);else if(!p.has('date'))p.set('date',date);return {...to,search:p.toString()};
}
export function Link(props:ComponentProps<typeof RouterLink>){const date=useContext(DateContext);return <RouterLink {...props} to={dated(props.to,date)}/>;}
export function NavLink(props:ComponentProps<typeof RouterNavLink>){const date=useContext(DateContext);return <RouterNavLink {...props} to={dated(props.to,date)}/>;}
export function useNavigate(){const navigate=routerNavigate(),date=useContext(DateContext);return ((to:To|number,options?:NavigateOptions)=>typeof to==='number'?navigate(to):navigate(dated(to,date),options)) as ReturnType<typeof routerNavigate>;}
