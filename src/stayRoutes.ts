import {isDate,type Dataset} from './model';
export const nightPath=(date:string)=>`/stays/night/${date}`;
export const propertyPath=(date:string,id:string)=>`${nightPath(date)}/properties/${encodeURIComponent(id)}`;
export const areaPath=(date:string,propertyId:string,areaId:string)=>`${propertyPath(date,propertyId)}/areas/${encodeURIComponent(areaId)}`;
export type StayRoute={kind:'overview'|'accommodation'|'night'|'property'|'area'|'unknown';date?:string;propertyId?:string;areaId?:string};
export function parseStayRoute(path:string):StayRoute {
 if(path==='/stays')return {kind:'overview'};
 if(path==='/stays/accommodation')return {kind:'accommodation'};
 const match=path.match(/^\/stays\/night\/([^/]+)(?:\/properties\/([^/]+)(?:\/areas\/([^/]+))?)?$/);
 if(!match||!isDate(match[1]))return {kind:'unknown'};
 try{return {kind:match[3]?'area':match[2]?'property':'night',date:match[1],propertyId:match[2]?decodeURIComponent(match[2]):undefined,areaId:match[3]?decodeURIComponent(match[3]):undefined};}catch{return {kind:'unknown'};}
}
export function legacyStayTarget(path:string,params:URLSearchParams,data:Dataset,date:string) {
 let destination:string|undefined;
 if(path==='/areas')destination=params.get('property')?propertyPath(date,params.get('property')!):nightPath(date);
 else if(path.startsWith('/areas/')){const area=data.areas.find(a=>a.id===path.split('/')[2]);destination=area?areaPath(date,area.propertyId,area.id):nightPath(date);}
 else if(/^\/stays\/[^/]+$/.test(path)&&path!=='/stays/accommodation')destination=propertyPath(date,decodeURIComponent(path.split('/')[2]));
 if(!destination)return;
 const next=new URLSearchParams(params);next.set('date',date);next.delete('property');next.delete('area');
 return {pathname:destination,search:next.toString()};
}
