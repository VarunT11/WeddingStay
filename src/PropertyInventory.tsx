import {useEffect,useMemo,useRef,useState} from 'react';
import {BedDouble,ChevronDown,Layers,Pencil,Plus,Search,Sparkles,Users,X} from 'lucide-react';
import {type Area,type Dataset,type Room} from './data';
import {Link} from './navigation';
import {managePropertyPath} from './stayRoutes';
import './property-inventory.css';

export type InventoryFeedback={kind:'room'|'area';id:string;areaId?:string;propertyId:string;deleted?:boolean;sequence:number};
type Props={data:Dataset;propertyId:string;hidden:boolean;feedback?:InventoryFeedback;onAddArea:(id:string)=>void;onAddRoom:(id:string)=>void;onEditArea:(area:Area)=>void;onEditRoom:(room:Room)=>void};
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const roomActionId=(id:string)=>'inventory-room-'+encodeURIComponent(id);
const areaActionId=(id:string)=>'inventory-area-'+encodeURIComponent(id);
export function PropertyInventory({data,propertyId,hidden,feedback,onAddArea,onAddRoom,onEditArea,onEditRoom}:Props){
 const [query,setQuery]=useState(''),[areaFilter,setAreaFilter]=useState(''),[typeFilter,setTypeFilter]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[reveal,setReveal]=useState<InventoryFeedback>(),[notice,setNotice]=useState('');
 const handled=useRef<number|undefined>(undefined),pendingFocus=useRef<number|undefined>(undefined),container=useRef<HTMLElement>(null);
 const areas=useMemo(()=>data.areas.filter(area=>area.propertyId===propertyId).sort((a,b)=>collator.compare(a.name,b.name)||a.id.localeCompare(b.id)),[data.areas,propertyId]);
 const areaIds=new Set(areas.map(area=>area.id)),rooms=data.rooms.filter(room=>areaIds.has(room.areaId));
 const q=query.trim().toLocaleLowerCase(),filtering=!!(q||areaFilter||typeFilter);
 const match=(room:Room,area:Area)=>(!areaFilter||areaFilter===area.id)&&(!typeFilter||room.type===typeFilter)&&(!q||[room.number,room.notes||'',area.name,room.special||''].some(value=>value.toLocaleLowerCase().includes(q)));
 const matched=rooms.filter(room=>match(room,areas.find(area=>area.id===room.areaId)!));
 const groups=areas.map(area=>{const all=rooms.filter(room=>room.areaId===area.id).sort((a,b)=>collator.compare(a.number,b.number)||a.id.localeCompare(b.id));return {area,all,visible:all.filter(room=>match(room,area)||(reveal?.kind==='room'&&!reveal.deleted&&reveal.id===room.id))};}).filter(group=>!filtering||group.visible.length||reveal?.areaId===group.area.id||(reveal?.kind==='area'&&reveal.id===group.area.id)||(!group.all.length&&!typeFilter&&(!areaFilter||areaFilter===group.area.id)&&(!q||group.area.name.toLocaleLowerCase().includes(q))));
 const destination=feedback&&feedback.propertyId!==propertyId?data.properties.find(property=>property.id===feedback.propertyId):undefined;
 useEffect(()=>{
  if(hidden||!feedback||handled.current===feedback.sequence)return;
  handled.current=feedback.sequence;
  pendingFocus.current=feedback.sequence;
  const inProperty=feedback.propertyId===propertyId;
  setReveal(inProperty?feedback:undefined);
  if(inProperty){const areaId=feedback.kind==='area'?feedback.id:feedback.areaId;if(areaId)setCollapsed(previous=>{const next=new Set(previous);next.delete(areaId);return next;});}
  setNotice(feedback.deleted?(feedback.kind==='room'?'Room removed.':'Area removed.'):!inProperty?'Saved in another property.':feedback.kind==='room'?'Room saved.':'Area saved.');
 },[feedback,hidden,propertyId]);
 useEffect(()=>{
  if(hidden||!feedback||pendingFocus.current!==feedback.sequence)return;
  const frame=requestAnimationFrame(()=>{
   const room=feedback.kind==='room'&&!feedback.deleted?document.getElementById(roomActionId(feedback.id)):null;
   const area=document.getElementById(areaActionId(feedback.kind==='area'?feedback.id:feedback.areaId||''));
   const target=room||area||container.current?.querySelector<HTMLButtonElement>('[data-add-area]');
   target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});
   pendingFocus.current=undefined;
  });return()=>cancelAnimationFrame(frame);
 },[feedback,hidden,reveal]);
 function changeFilter(action:()=>void){setReveal(undefined);setNotice('');action();}
 function clear(){changeFilter(()=>{setQuery('');setAreaFilter('');setTypeFilter('');});}
 function toggle(id:string){setCollapsed(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next;});}
 const revealedRoom=reveal?.kind==='room'?rooms.find(room=>room.id===reveal.id):undefined;
 const extraRoom=!!revealedRoom&&!match(revealedRoom,areas.find(area=>area.id===revealedRoom.areaId)!);
 return <section className="inventory-manager" hidden={hidden} ref={container} aria-labelledby="property-inventory-title">
  <div className="inventory-manager-heading"><div><h2 id="property-inventory-title">Areas & rooms</h2><p>Set up your rooms once for every night of the celebration.</p></div><button data-add-area className="button primary" onClick={()=>onAddArea(propertyId)}><Plus size={16}/>Add area</button></div>
  <dl className="inventory-totals" aria-label="Property inventory totals"><div><dt><Layers size={15}/>Areas</dt><dd>{areas.length}</dd></div><div><dt><BedDouble size={15}/>Rooms</dt><dd>{rooms.length}</dd></div><div><dt><Users size={15}/>Guest capacity</dt><dd>{rooms.reduce((total,room)=>total+room.capacity,0)}</dd></div></dl>
  {areas.length>0&&<><div className="inventory-search-controls"><label className="inventory-room-search"><Search size={17}/><span className="inventory-sr-only">Search rooms or areas</span><input type="search" placeholder="Search rooms or areas…" value={query} onChange={event=>changeFilter(()=>setQuery(event.target.value))}/>{query&&<button className="icon-button" aria-label="Clear room search" onClick={()=>changeFilter(()=>setQuery(''))}><X size={16}/></button>}</label><label className="inventory-select"><span>Area</span><select value={areaFilter} onChange={event=>changeFilter(()=>setAreaFilter(event.target.value))}><option value="">All areas</option>{areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label className="inventory-select"><span>Room type</span><select value={typeFilter} onChange={event=>changeFilter(()=>setTypeFilter(event.target.value))}><option value="">All types</option><option value="Normal">Normal</option><option value="Suite">Suite</option></select></label></div>
  <div className="inventory-list-tools"><p role="status">{filtering?`${matched.length} of ${rooms.length} rooms match`:`${rooms.length} ${rooms.length===1?'room':'rooms'}`} {filtering&&<button className="text-link" onClick={clear}>Clear filters<X size={13}/></button>}</p>{areas.length>1&&!filtering&&<div><button className="text-link" onClick={()=>{setReveal(undefined);setCollapsed(new Set());}}>Expand all</button><span aria-hidden="true">·</span><button className="text-link" onClick={()=>{setReveal(undefined);setCollapsed(new Set(areas.map(area=>area.id)));}}>Collapse all</button></div>}</div></>}
  {notice&&<div className="inventory-save-notice" role="status"><span>{notice}{extraRoom?' The saved room is shown alongside your matches; filters are kept.':''}</span>{destination&&<Link className="text-link" to={managePropertyPath(destination.id)+'?section=rooms'}>Open {destination.name}</Link>}<button className="icon-button" aria-label="Dismiss saved inventory notice" onClick={()=>{setNotice('');setReveal(undefined);}}><X size={15}/></button></div>}
  {!areas.length?<div className="inventory-empty"><Layers size={25}/><h3>Add your first area</h3><p>Group rooms by floor, wing or building. Start with “Main” if the property has a single area.</p><button className="button secondary" onClick={()=>onAddArea(propertyId)}><Plus size={15}/>Add area</button></div>:!groups.length?<div className="inventory-empty"><Search size={25}/><h3>No matching rooms or areas</h3><p>Try another room number, area name or room type.</p><button className="button secondary" onClick={clear}>Clear filters</button></div>:<div className="inventory-area-list">{groups.map(({area,all,visible})=>{
   const expanded=filtering||!collapsed.has(area.id),panelId='inventory-area-rooms-'+encodeURIComponent(area.id);
   return <article className="inventory-area-section" key={area.id}><header className="inventory-area-header"><button id={areaActionId(area.id)} className="inventory-area-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={()=>toggle(area.id)} disabled={filtering}><ChevronDown size={17} className={expanded?'':'is-collapsed'}/><span className="inventory-area-symbol"><Layers size={17}/></span><span><h3>{area.name}</h3><small>{all.length} {all.length===1?'room':'rooms'}<span aria-hidden="true"> · </span>{all.reduce((total,room)=>total+room.capacity,0)} guest capacity{filtering&&all.length>0?` · ${visible.length} shown`:''}</small></span></button><div className="inventory-area-actions"><button className="icon-button" aria-label={'Edit area '+area.name} title={'Edit '+area.name} onClick={()=>onEditArea(area)}><Pencil size={16}/></button><button className="button secondary" onClick={()=>onAddRoom(area.id)} aria-label={'Add room to '+area.name}><Plus size={15}/>Add room</button></div></header>
   <div id={panelId} hidden={!expanded}>{!all.length?<div className="inventory-area-empty"><BedDouble size={20}/><div><p>No rooms in this area yet.</p><small>Add room numbers and guest capacity to complete this area.</small></div><button className="text-link" onClick={()=>onAddRoom(area.id)}>Add first room<Plus size={14}/></button></div>:!visible.length?<p className="inventory-area-empty">No rooms match the current filters in this area.</p>:<table className="inventory-room-table"><caption className="inventory-sr-only">Rooms in {area.name}</caption><thead><tr><th scope="col">Room</th><th scope="col">Type</th><th scope="col">Capacity</th><th scope="col">Notes</th><th scope="col"><span className="inventory-sr-only">Actions</span></th></tr></thead><tbody>{visible.map(room=><tr key={room.id} className={reveal?.id===room.id?'inventory-saved-row':''}><th scope="row" className="inventory-room-number"><BedDouble size={15}/><span><span className="inventory-mobile-only">Room </span>{room.number}</span></th><td className="inventory-room-type"><span className={'inventory-type-badge '+(room.type==='Suite'?'is-suite':'')}>{room.type==='Suite'&&<Sparkles size={12}/>} {room.special||room.type}</span></td><td className="inventory-room-capacity"><Users size={14}/>{room.capacity}<span className="inventory-mobile-only"> guests</span></td><td className="inventory-room-notes"><span title={room.notes}>{room.notes||<span className="inventory-muted">—</span>}</span></td><td className="inventory-room-edit"><button id={roomActionId(room.id)} className="text-link" onClick={()=>onEditRoom(room)} aria-label={'Edit room '+room.number+' in '+area.name}><Pencil size={14}/><span>Edit</span></button></td></tr>)}</tbody></table>}</div></article>;
  })}</div>}
 </section>;
}
