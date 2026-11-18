import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider, useLocation, useNavigate as useRouterNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BedDouble, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, DoorOpen, Flower2, Heart, LayoutDashboard, Leaf, MapPin, Minus, Plus, Pencil, Trash2, Tag, ArrowRightLeft, Database, Download, Upload, History, Undo2, FileDown, Search, SlidersHorizontal, Sparkles, Users, Waves, X } from 'lucide-react';
import { countOf, validateData, createHistoryEvent, recoverAction, recoveryReason, historyTitles, filterRooms, statusOf, summary, type Area, type AllocationLabel, type Dataset, type Room, type Status, type HistoryEntry } from './data';
import {serializeDataset,exportFilename} from './transfer';
import {generateReport, reportSelection, type ReportContext, type ReportOptions, type ReportScope} from './reports';
import {useOfflineApp} from './pwa';
import './styles.css';
import {Stays} from './Stays';
import {WeddingDashboard} from './WeddingDashboard';
import {areaPath,propertyPath,nightPath,roomsPath,parseStayRoute,legacyStayTarget} from './stayRoutes';
import {BulkAllocation} from './RoomPlanning';
import {GuestPicker,stayStatus,stayDate,stayDates} from './StayUI';
import {StayPanel} from './StayPanel';
import {DateContext,Link,NavLink,useNavigate,dated} from './navigation';
import {projectData,isDate} from './data';
import {PeopleEvents} from './PeopleEvents';
import {Confirm,useDialog} from './dialogs';
import {CalendarDays,LogOut,Cloud,WifiOff} from 'lucide-react';
import {CloudAccess,CloudSyncNotice,useCloud} from './CloudAccess';
import {syncLabels} from './cloudSync';
import {CategoryImport} from './CategoryImport';
import {OfflineModeControls} from './OfflineControls';
import {type CloudSnapshot} from './cloudStore';
import {cloudError} from './firebase';
import {normalizeData} from './data';
import {CloudReplacement} from './CloudReplacement';
import {WeddingArt,WeddingFlourish} from './WeddingArt';
import './wedding-theme.css';
import {AppLogo} from './AppLogo';
import './logo.css';

const AreasContext=createContext<Area[]>([]);
const PropertiesContext=createContext<Dataset['properties']>([]);
const GuestsContext=createContext<Dataset['guests']>([]);
type LabelResult = {id?:string;error?:string};
const LabelsContext=createContext<{labels:AllocationLabel[];saveLabel:(name:string,id?:string)=>Promise<LabelResult>;deleteLabel:(id:string)=>Promise<string|null>}>({labels:[],saveLabel:async()=>({error:'Unavailable'}),deleteLabel:async()=>null});
type InventoryTarget = {kind:'area';area?:Area;propertyId?:string}|{kind:'room';room?:Room;areaId?:string};
const statuses: Status[] = ['Available', 'Allotted', 'Occupied'];
const statusClass = (s: string) => s.toLowerCase();
const areaIcon = (id: string) => id === 'garden' ? <Leaf/> : id === 'poolside' ? <Waves/> : id === 'main' ? <DoorOpen/> : <Flower2/>;
function Badge({status}: {status: Status}) { return <span className={`badge ${statusClass(status)}`}><i/>{stayStatus(status)}</span>; }
function App() {
  const cloud=useCloud();
  const appliedSnapshot=useRef(cloud.snapshot);
  const schema=useRef(cloud.snapshot.clientSchema),revision=useRef(cloud.snapshot.revision),savingRef=useRef(false);
  const [saving,setSaving]=useState(false);
  const offline=useOfflineApp();
  const [laterUpdate,setLaterUpdate]=useState(false);
  const [confirmUpdate,setConfirmUpdate]=useState(false);
  const [savedData,setData]=useState(cloud.snapshot.data);
  const [error,setError]=useState('');
  const [toast,setToast] = useState('');
  const [inventory,setInventory] = useState<InventoryTarget|null>(null);
  const [manageLabels,setManageLabels]=useState(false);
  const [dataDialog,setDataDialog]=useState(false);
  const [pdfScope,setPdfScope]=useState<ReportScope|null>(null);
  const location = useLocation(); const rawNavigate = useRouterNavigate(); const [params] = useSearchParams();
  const [rememberedDate,setRememberedDate]=useState(()=>{try{const d=localStorage.getItem('weddingstay.selectedDate');return d&&isDate(d)?d:cloud.snapshot.data.wedding.defaultDate;}catch{return cloud.snapshot.data.wedding.defaultDate;}});
  const stayRoute=parseStayRoute(location.pathname);
  const requestedDate=params.get('date'),selectedDate=stayRoute.date||(requestedDate&&isDate(requestedDate)?requestedDate:rememberedDate);
  const legacyTarget=legacyStayTarget(location.pathname,params,savedData,selectedDate);
  const navigate:ReturnType<typeof useRouterNavigate>=((to:any,options?:any)=>typeof to==='number'?rawNavigate(to):rawNavigate(dated(to,selectedDate),options)) as ReturnType<typeof useRouterNavigate>;
  const data=projectData(savedData,selectedDate),areas=data.areas;
  const displayAreas=areas.map(a=>({...a,name:(data.properties.find(p=>p.id===a.propertyId)?.name||'Property')+' · '+a.name}));
  useEffect(()=>{setRememberedDate(selectedDate);try{localStorage.setItem('weddingstay.selectedDate',selectedDate);}catch{/* Browsing still works without preference storage. */}if(legacyTarget){void rawNavigate({...legacyTarget,hash:location.hash},{replace:true,state:location.state,preventScrollReset:true});}else if(requestedDate!==selectedDate){const p=new URLSearchParams(location.search);p.set('date',selectedDate);void rawNavigate({pathname:location.pathname,search:p.toString()},{replace:true,preventScrollReset:true,state:location.state});}},[selectedDate,requestedDate,location.pathname,location.search]);
  const propertyFilter=stayRoute.propertyId||params.get('property')||'';
  const staysPage=location.pathname==='/stays'||location.pathname.startsWith('/stays/');
  const [globalQuery,setGlobalQuery] = useState('');
  const areaId = stayRoute.areaId;
  const area = areas.find(a => a.id === areaId);
  const managementKind=location.pathname==='/guests'?'guests':(location.pathname==='/events'||location.pathname.startsWith('/events/'))?'events':undefined;
  const contextEvent=location.pathname.startsWith('/events/')?data.events.find(e=>e.id===decodeURIComponent(location.pathname.slice(8))):undefined;
  const managementOpen=!!(managementKind&&(params.has('guest')||params.has('event')||params.has('editEvent')||params.has('categories')||params.has('merge')||params.has('invite')||params.has('rsvp')||params.has('accommodationEdit')));
  const page = staysPage?'Stays':managementKind==='guests'?'Guests':managementKind==='events'?'Events':location.pathname === '/' ? 'Dashboard' : location.pathname === '/areas' ? 'Areas' : area ? area.name : 'Browse rooms';
  const reportContext:ReportContext=(stayRoute.kind==='rooms'||area)?{guest:params.get('guestGroup')||undefined,property:propertyFilter||undefined,area:area?.id||params.get('area')||undefined,status:params.get('status')||undefined,type:params.get('type')||undefined,query:params.get('q')||undefined,label:data.labels.some(l=>l.id===params.get('label'))?params.get('label')||undefined:undefined}:{};
  const bulkOpen=!!stayRoute.date&&params.get('bulk')==='1';
  const selectedRoom = !stayRoute.date||bulkOpen?undefined:data.rooms.find(r => r.id === params.get('room'));
  useEffect(() => { if (toast) { const id = window.setTimeout(()=>setToast(''),3500); return ()=>clearTimeout(id); } },[toast]);
  async function save(next: Dataset, message: string):Promise<boolean> {
    if(savingRef.current)return false;
    if(!cloud.canEdit){setError('Saving is paused. Finish the current sync or review, or reconnect. Your draft is kept.');return false;}
    savingRef.current=true;setSaving(true);setError('');
    try {
      const before:CloudSnapshot={data:savedData,revision:revision.current,datasetVersion:cloud.snapshot.datasetVersion,clientSchema:schema.current};
      const confirmed=await cloud.commit(before,normalizeData({...next,updatedAt:new Date().toISOString()}));
      appliedSnapshot.current=confirmed;schema.current=confirmed.clientSchema;revision.current=confirmed.revision;setData(confirmed.data);setToast(cloud.workMode==='offline'?'Saved on this device':message);return true;
    } catch(cause){setError(cloudError(cause));return false;}
    finally{savingRef.current=false;setSaving(false);}
  }
  async function recover(eventId:string):Promise<string|null> {
    try{return await save(recoverAction(data,eventId),'Original allocation restored')?null:'Could not save recovery. Current data has been kept.';}
    catch(e){return e instanceof Error?e.message:'Recovery is unavailable.';}
  }
  async function saveInventory(target:Area|Room):Promise<string|null> {
    const now=new Date().toISOString();
    let next:Dataset;
    if('number' in target){
      const previous=data.rooms.find(r=>r.id===target.id);
      const room={...target,allocation:previous?.allocation,createdAt:previous?.createdAt||now,updatedAt:now};
      next={...data,rooms:previous?data.rooms.map(r=>r.id===room.id?room:r):[...data.rooms,room]};
    }else{
      const previous=areas.find(a=>a.id===target.id);
      const area={...target,propertyId:target.propertyId||previous?.propertyId||data.properties[0]?.id||'',createdAt:previous?.createdAt||now,updatedAt:now};
      next={...data,areas:previous?areas.map(a=>a.id===area.id?area:a):[...areas,area]};
    }
    try{validateData(next);}catch(e){return e instanceof Error?e.message:'Please check these details.';}
    return await save(next,'Details saved')?null:'Could not save to the cloud. Please try again.';
  }
  async function deleteInventory(target:Area|Room):Promise<string|null> {
    if('number' in target){
      if(data.allocations.some(a=>a.roomId===target.id))return 'This room has saved stays. Keep it to preserve their references.';
      return await save({...data,rooms:data.rooms.filter(r=>r.id!==target.id)},'Room deleted')?null:'Could not save the deletion.';
    }
    if(data.rooms.some(r=>r.areaId===target.id))return 'Move or remove all rooms before deleting this area.';
    return await save({...data,areas:areas.filter(a=>a.id!==target.id)},'Area deleted')?null:'Could not save the deletion.';
  }
  async function saveLabel(rawName:string,id?:string):Promise<LabelResult> {
    const name=rawName.trim();
    if(!name)return {error:'Enter a label name.'};
    if(data.labels.some(label=>label.id!==id&&label.name.trim().toLowerCase()===name.toLowerCase()))return {error:'A label with this name already exists. Choose it from the list.'};
    const now=new Date().toISOString(), previous=data.labels.find(label=>label.id===id);
    if(id&&!previous)return {error:'This label no longer exists.'};
    const label:AllocationLabel={id:id||crypto.randomUUID(),name,createdAt:previous?.createdAt||now,updatedAt:now};
    const next={...data,labels:id?data.labels.map(l=>l.id===id?label:l):[...data.labels,label]};
    return await save(next,id?'Label renamed':'Label created')?{id:label.id}:{error:'Could not save this label. Please try again.'};
  }
  async function deleteLabel(id:string):Promise<string|null> {
    if(data.requirements.some(r=>r.labelId===id))return 'This label has room requirements. Remove those requirements before deleting the label.';
    const now=new Date().toISOString();
    const updatedRooms=data.rooms.map(room=>room.allocation?.labelId===id?{...room,updatedAt:now,allocation:{...room.allocation,labelId:undefined,updatedAt:now}}:room);
    const events=data.rooms.filter(room=>room.allocation?.labelId===id).map(room=>createHistoryEvent(data,'allocation-edited',[room],[updatedRooms.find(r=>r.id===room.id)!]));
    const next={...data,labels:data.labels.filter(l=>l.id!==id),allocations:data.allocations.map(a=>a.labelId===id?{...a,labelId:undefined,updatedAt:now}:a),rooms:updatedRooms,history:[...data.history,...events]};
    if(!await save(next,'Label removed; allocations kept'))return 'Could not remove this label.';
    if(params.get('label')===id){const p=new URLSearchParams(params);p.delete('label');navigate({pathname:location.pathname,search:p.toString()},{replace:true,preventScrollReset:true});}
    return null;
  }
  const closeRoom = () => { const back = location.state as {roomOverlay?: boolean} | null; if (back?.roomOverlay) navigate(-1); else { const p = new URLSearchParams(params); p.delete('room');p.delete('allocation'); navigate({pathname:location.pathname,search:p.toString()},{replace:true}); } };
  const nestedNight=!!stayRoute.date;
  const modeBlocked=!!(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||pdfScope||saving);
  const paused=!!(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||dataDialog||pdfScope||saving);
  useEffect(()=>{if(!paused&&cloud.snapshot!==appliedSnapshot.current){appliedSnapshot.current=cloud.snapshot;schema.current=cloud.snapshot.clientSchema;revision.current=cloud.snapshot.revision;setData(cloud.snapshot.data);}},[cloud.snapshot,paused]);
  return <DateContext.Provider value={selectedDate}><PropertiesContext.Provider value={data.properties}><GuestsContext.Provider value={data.guests}><AreasContext.Provider value={displayAreas}><LabelsContext.Provider value={{labels:data.labels,saveLabel,deleteLabel}}><div className="app-shell">
    <aside className="sidebar"><Link className="brand wedding-brand" to="/"><span className="brand-mark"><AppLogo variant="full"/></span><span>WeddingStay<small>ROOM FOR CELEBRATION</small></span></Link>
      <div className="nav-label">YOUR WEDDING SPACE</div><nav>{[["/","Dashboard",<LayoutDashboard/>],["/guests","Guests",<Users/>],["/events","Events",<CalendarDays/>],["/stays","Stays",<BedDouble/>]].map(([to,label,icon])=><NavLink key={String(to)} to={String(to)} end={to==='/'}>{icon}<span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="celebration-note"><WeddingFlourish/><p>A little less coordinating.<br/><strong>A little more celebrating.</strong></p><span>{data.wedding.name}</span></div><div className="profile"><span>Y</span><div>Your wedding space<small>Shared wedding · {cloud.role}</small></div></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Your wedding <ChevronRight size={14}/><span>{page}</span></div><form className="global-search" onSubmit={e=>{e.preventDefault();const p=new URLSearchParams({q:globalQuery});if(stayRoute.propertyId)p.set('property',stayRoute.propertyId);if(stayRoute.areaId)p.set('area',stayRoute.areaId);navigate((nestedNight?roomsPath(selectedDate):contextEvent?location.pathname:'/guests')+'?'+p);setGlobalQuery('');}}><Search size={17}/><input aria-label={nestedNight?"Search rooms in this stay":"Search guest groups or members"} placeholder={nestedNight?"Find a room, family or guest…":"Find a guest or family…"} value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)}/><kbd>↵</kbd></form><button className="button secondary data-menu-button" onClick={()=>setDataDialog(true)}><Database size={15}/>Data</button><span className="sample-badge"><i/>{cloud.workMode==='offline'?'Working offline':syncLabels[cloud.status]}</span><button className="icon-button" aria-label="Sign out" title={cloud.user.email||'Sign out'} disabled={paused} onClick={()=>void cloud.signOut()}><LogOut size={17}/></button></header>
      <main key={location.pathname} className="page-enter"><CloudSyncNotice controlsDisabled={paused}/>
        {offline.enabled&&<div className={'offline-banner '+(offline.ready?'ready':'')} role="status"><span><CheckCheck size={14}/>{offline.error|| (offline.ready?'Ready for offline use':'Preparing offline use… keep the app connected')}</span>{offline.needRefresh&&!laterUpdate&&<div className="offline-update"><span>App update available</span><button disabled={!!(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||dataDialog||pdfScope)} onClick={()=>setConfirmUpdate(true)}>Reload to update</button><button onClick={()=>setLaterUpdate(true)}>Later</button>{(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||dataDialog||pdfScope)&&<small>Close open dialogs before updating.</small>}</div>}</div>}
        {cloud.workMode==='live'&&cloud.snapshot.revision>revision.current&&paused&&<div className="context-banner">Updates arrived from another device. Close the current panel to view them. Saving an older draft will be blocked.</div>}
        {(data.referenceData||nestedNight)&&<div className={'context-banner date-context'+(managementKind==='events'?' event-data-status reference-status':'')}><div>{data.referenceData&&<span>Fictional reference data</span>}{nestedNight&&<h2 className="night-context-title">Night of {new Date(selectedDate+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</h2>}</div></div>}
        {legacyTarget ? <p className="inventory-hint">Opening your stay…</p> : staysPage ? <Stays data={data} commit={save} onAddRoom={areaId=>setInventory({kind:'room',areaId})} onEditRoom={room=>setInventory({kind:'room',room})} onEditArea={area=>setInventory({kind:'area',area})} onAddArea={propertyId=>setInventory({kind:'area',propertyId})} renderAreas={propertyId=><div className="area-grid master">{areas.filter(a=>a.propertyId===propertyId).map(a=><AreaCard key={a.id} areaId={a.id} rooms={data.rooms} onEdit={()=>setInventory({kind:'area',area:a})}/>)}</div>} renderRooms={id=><RoomBrowser rooms={id?data.rooms:data.rooms.filter(r=>r.booked!==false||r.overdue)} areaId={id} onManageLabels={()=>setManageLabels(true)} onPdf={()=>setPdfScope('current')} onAddRoom={()=>setInventory({kind:'room',areaId:id||areas.find(a=>a.propertyId===propertyFilter)?.id})} onEditArea={id?()=>setInventory({kind:'area',area:areas.find(a=>a.id===id)!}):undefined}/>}/> : managementKind ? <PeopleEvents key={managementKind} kind={managementKind} data={data} commit={save}/> : location.pathname === '/' ? <WeddingDashboard data={savedData}/> : <div className="empty"><h2>Page not found</h2><Link className="button secondary" to="/stays">Explore stays</Link></div>}
        <footer><AppLogo decorative/><span>Made for the moments that matter.</span><span>WeddingStay · {data.wedding.name}</span></footer>
      </main>
    </div>
    <nav className="mobile-nav"><NavLink end to="/"><LayoutDashboard/><span>Dashboard</span></NavLink><NavLink to="/guests"><Users/><span>Guests</span></NavLink><NavLink to="/events"><CalendarDays/><span>Events</span></NavLink><NavLink to="/stays"><BedDouble/><span>Stays</span></NavLink></nav>
    {selectedRoom && <StayPanel key={selectedRoom.id+'-'+selectedDate+'-'+(params.get('allocation')||'view-'+(selectedRoom.allocation?.id||'empty'))} room={selectedRoom} data={data} selection={params.get('allocation')||undefined} prefillLabelId={params.get('label')||undefined} commit={save} onClose={closeRoom} onEditRoom={()=>setInventory({kind:'room',room:selectedRoom})} onSelect={(id,roomId)=>{const p=new URLSearchParams(params);p.set('allocation',id);if(roomId)p.set('room',roomId);navigate({pathname:location.pathname,search:p.toString()},{replace:true,state:location.state,preventScrollReset:true});}} history={<RoomHistory room={selectedRoom} data={data} onRecover={recover}/>}/>}

    {bulkOpen&&<BulkAllocation data={data} commit={save} onClose={()=>{if((location.state as {bulkOverlay?:boolean}|null)?.bulkOverlay)navigate(-1);else{const p=new URLSearchParams(params);p.delete('bulk');p.delete('requirement');navigate({pathname:location.pathname,search:p.toString()},{replace:true,state:location.state,preventScrollReset:true});}}}/>}
    {inventory&&<InventoryEditor key={inventory.kind+(inventory.kind==='room'?inventory.room?.id||'new':inventory.area?.id||'new')} target={inventory} rooms={data.rooms} properties={data.properties} onSave={saveInventory} onDelete={deleteInventory} onClose={()=>setInventory(null)}/>}
    {manageLabels&&<LabelsManager rooms={data.rooms} onClose={()=>setManageLabels(false)}/>}
    {dataDialog&&<DataDialog modeBlocked={modeBlocked} data={data} onPdf={nestedNight?()=>{setDataDialog(false);setPdfScope('all');}:undefined} onClose={()=>setDataDialog(false)}/>}
    {pdfScope&&nestedNight&&<PdfDialog data={data} context={reportContext} initialScope={pdfScope} onClose={()=>setPdfScope(null)}/>}
    {confirmUpdate&&<Confirm title="Apply the app update?" text="Saved allocations will stay on this device. The app will reload with the new version." action="Reload & update" onCancel={()=>setConfirmUpdate(false)} onConfirm={()=>{setConfirmUpdate(false);void offline.update();}}/>}
    {saving&&<div className="cloud-saving" role="status"><Cloud size={22}/>Saving to the shared wedding…</div>}
    {error&&<div className="cloud-error-toast" role="alert"><span>{error}</span><button className="quiet-button" onClick={()=>setError('')}>Dismiss</button></div>}
    {toast && <div role="status" className="toast"><CheckCheck size={18}/>{toast}</div>}
  </div></LabelsContext.Provider></AreasContext.Provider></GuestsContext.Provider></PropertiesContext.Provider></DateContext.Provider>;
}
function PageTitle({eyebrow,title,description,action}: {eyebrow:string;title:string;description:string;action?:React.ReactNode}) {return <div className="page-heading"><div className="wedding-heading-copy"><WeddingArt kind="stay"/><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;}
function Breakdown({rooms:inventory}: {rooms:Room[]}) {const rooms=inventory.filter(r=>r.booked!==false||r.overdue);const s=summary(rooms);return <div className="breakdown" aria-label={`${s.available} available, ${s.allotted} reserved, ${s.occupied} checked in`}>{statuses.map(st=><span key={st} className={statusClass(st)} style={{width:`${rooms.length ? rooms.filter(r=>statusOf(r)===st).length/rooms.length*100:0}%`}}/>)}</div>;}
function AreaCard({areaId,rooms,onEdit}: {areaId:string;rooms:Room[];onEdit?:()=>void}) {
 const areas=useContext(AreasContext);
 const a=areas.find(a=>a.id===areaId)!;const date=useContext(DateContext),destination=areaPath(date,a.propertyId,a.id);const subset=rooms.filter(r=>r.areaId===areaId);const s=summary(subset);const navigate=useNavigate();
 return <article className={'area-card '+a.motif} onClick={e=>{if(!(e.target as HTMLElement).closest('a,button'))navigate(destination);}}>
 <Link className="area-art" to={destination} aria-label={'Explore '+a.name}><span className="area-art-icon">{areaIcon(a.id)}</span><span className="room-count">{subset.length} rooms</span><WeddingArt kind="stay"/></Link>
 <div className="area-body"><Link className="area-title" to={destination}><h3>{a.name}</h3><ArrowUpRight size={17}/></Link><p>{a.description}</p>{subset.length>0&&subset.every(r=>r.booked===false&&!r.overdue)&&<p className="inventory-hint">Not booked for the selected date</p>}<Breakdown rooms={subset}/><div className="mini-status"><Link to={destination+'?status=Available'}><i className="dot available"/>{s.available} available</Link><span>{s.allotted} reserved</span><span>{s.occupied} checked in</span></div></div>
 <div className="area-card-footer"><span><Users size={14}/>{s.assigned} assigned · {s.arrived} arrived</span><Link to={destination} aria-label={'View rooms in '+a.name}><ArrowRight size={17}/></Link>{onEdit&&<button className="icon-button area-edit" onClick={onEdit} aria-label={'Edit '+a.name}><Pencil size={14}/></button>}</div></article>;
}

function RoomBrowser({rooms,areaId,onAddRoom,onEditArea,onManageLabels,onPdf}: {rooms:Room[];areaId?:string;onAddRoom:()=>void;onEditArea?:()=>void;onManageLabels:()=>void;onPdf:()=>void}) {
 const {labels}=useContext(LabelsContext);
 const properties=useContext(PropertiesContext);
 const guests=useContext(GuestsContext);
 const date=useContext(DateContext);
 const areas=useContext(AreasContext);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [params,setParams]=useSearchParams();const location=useLocation();const navigate=useNavigate();const a=areas.find(a=>a.id===areaId);const q=params.get('q')||''; const st=params.get('status')||''; const type=params.get('type')||'';const chosenArea=areaId||params.get('area')||'';const selectedLabel=labels.find(l=>l.id===params.get('label'));
 const propertyId=a?.propertyId||params.get('property')||'';
 const areaRooms=rooms.filter(r=>(!areaId||r.areaId===areaId)&&(!propertyId||r.propertyId===propertyId));const s=summary(areaRooms);
 const filtered=filterRooms(rooms,labels,{guest:params.get('guestGroup')||undefined,property:propertyId,area:chosenArea,status:st,type,query:q,label:selectedLabel?.id},guests);
 function filter(k:string,v:string){const p=new URLSearchParams(params);p.delete('room');if(v)p.set(k,v);else p.delete(k);setParams(p,{replace:true,preventScrollReset:true});}
 function openRoom(room:Room){scroll.current=window.scrollY;const p=new URLSearchParams(params);p.set('room',room.id);p.delete('allocation');navigate({pathname:location.pathname,search:p.toString()},{state:{roomOverlay:true},preventScrollReset:true});}
 const resetFilters=()=>{const p=new URLSearchParams();const d=params.get('date');if(d)p.set('date',d);if(a)p.set('property',propertyId);setParams(p,{replace:true});};
 const scroll=useRef<number|null>(null);
 useEffect(()=>{if(!params.has('room')&&scroll.current!==null)window.scrollTo(0,scroll.current);},[params]);
 return <><Link className="back-link" to={a?propertyPath(date,propertyId):nightPath(date)}><ChevronLeft size={15}/>{a?'Back to property areas':'Back to this stay night'}</Link><PageTitle eyebrow={a?'YOUR AREAS / '+a.name.toUpperCase():'FIND THEIR HOME AWAY FROM HOME'} title={a?a.name:'Rooms'} description={a?a.description:'Room availability for this night. Choose stay dates when assigning rooms.'} action={<div className="inventory-actions"><button className="button primary" onClick={()=>{const p=new URLSearchParams(params);p.delete('room');p.delete('allocation');p.set('bulk','1');if(a){p.set('property',a.propertyId);p.set('area',a.id);}navigate({pathname:location.pathname,search:p.toString()},{state:{bulkOverlay:true},preventScrollReset:true});}}><Plus size={15}/>Assign rooms</button><details className="stay-tools"><summary className="button secondary">Tools</summary><div><button className="button secondary" onClick={onPdf}><FileDown size={15}/>Download PDF</button><button className="button secondary" onClick={onManageLabels}><Tag size={15}/>Labels</button>{onEditArea&&<button className="button secondary" onClick={onEditArea}><Pencil size={15}/>Edit area</button>}<button className="button primary" onClick={onAddRoom} disabled={!areas.some(ar=>!propertyId||ar.propertyId===propertyId)}><Plus size={16}/>Add room</button></div></details></div>}/>
 {a&&<div className="area-summary-strip"><span><BedDouble size={18}/><strong>{s.total}</strong> booked rooms</span>{statuses.map(status=><button key={status} onClick={()=>filter('status',status)}><i className={'dot '+statusClass(status)}/><strong>{areaRooms.filter(r=>(r.booked!==false||r.overdue)&&statusOf(r)===status).length}</strong> {stayStatus(status)}</button>)}<span><Users size={17}/><strong>{s.arrived}/{s.assigned}</strong> arrived</span></div>}
 <section className="browser-toolbar"><div className="filter-search"><Search size={19}/><input aria-label={a?'Search rooms in '+a.name:'Search rooms, families or guests'} placeholder="Search room, family or guest…" value={q} onChange={e=>filter('q',e.target.value)}/>{q&&<button aria-label="Clear search" onClick={()=>filter('q','')}><X size={16}/></button>}</div></section><details className="stay-filter-panel" open={filtersOpen} onToggle={e=>setFiltersOpen(e.currentTarget.open)}><summary>Filters{[propertyId,chosenArea,selectedLabel,params.get('guestGroup'),type].filter(Boolean).length?' ('+[propertyId,chosenArea,selectedLabel,params.get('guestGroup'),type].filter(Boolean).length+')':''}</summary><div className="selects"><GuestPicker guests={guests} value={params.get('guestGroup')||''} onChange={value=>filter('guestGroup',value)} label="Filter by guest group" empty="All guest groups"/>{!a&&<label><MapPin size={16}/><select aria-label="Filter by property" value={propertyId} onChange={e=>{const p=new URLSearchParams(params);p.delete('area');p.delete('room');p.delete('allocation');e.target.value?p.set('property',e.target.value):p.delete('property');setParams(p,{replace:true,preventScrollReset:true});}}><option value="">All properties</option>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}<label><Tag size={16}/><select aria-label="Filter by allocation label" value={selectedLabel?.id||''} onChange={e=>filter('label',e.target.value)}><option value="">All labels</option>{labels.map(label=><option key={label.id} value={label.id}>{label.name}</option>)}</select><ChevronDown size={14}/></label>{!a&&<label><MapPin size={16}/><select aria-label="Filter by area" value={chosenArea} onChange={e=>filter('area',e.target.value)}><option value="">All areas</option>{areas.filter(ar=>!propertyId||ar.propertyId===propertyId).map(ar=><option key={ar.id} value={ar.id}>{ar.name}</option>)}</select><ChevronDown size={14}/></label>}<label><SlidersHorizontal size={16}/><select aria-label="Filter by room type" value={type} onChange={e=>filter('type',e.target.value)}><option value="">All room types</option><option>Normal</option><option>Suite</option></select><ChevronDown size={14}/></label></div></details>
 <div className="stay-filter-chips">{[['property',propertyId,properties.find(p=>p.id===propertyId)?.name],['area',chosenArea,areas.find(a=>a.id===chosenArea)?.name],['label',selectedLabel?.id,selectedLabel?.name],['guestGroup',params.get('guestGroup'),guests.find(g=>g.id===params.get('guestGroup'))?.name],['type',type,type]].filter(([key,value])=>value&&!(key==='property'&&a)&&!(key==='area'&&a)).map(([key,,label])=><button key={key} onClick={()=>{const p=new URLSearchParams(params);p.delete(key!);if(key==='property')p.delete('area');setParams(p,{replace:true,preventScrollReset:true});}} aria-label={'Remove '+label+' filter'}>{label} ×</button>)}</div>
 <div className="browser-subbar"><div className="status-tabs">{['',...statuses].map(status=><button className={st===status?'selected':''} key={status} onClick={()=>filter('status',status)}>{status&&<i className={'dot '+statusClass(status)}/>}<span>{status?stayStatus(status):'All rooms'}</span></button>)}</div><span className="result-count">{filtered.length} {filtered.length===1?'room':'rooms'}{(q||st||type||selectedLabel||params.get('guestGroup')||(!a&&(chosenArea||propertyId)))&&<button onClick={resetFilters}>Reset filters<X size={13}/></button>}</span></div>
 {selectedLabel&&<div className="label-context"><span className="allocation-label"><Tag size={12}/>{selectedLabel.name}</span><p>{st==='Available'?'These rooms are unassigned. New allocations will start with this label.':'Showing allocations with this label.'}</p>{st!=='Available'&&<button onClick={()=>{const p=new URLSearchParams(params);p.set('status','Available');p.delete('q');p.delete('room');setParams(p,{replace:true});}}>Find available rooms for this label<ArrowRight size={14}/></button>}</div>}
 {filtered.length?<CompactRooms rooms={filtered} onOpen={openRoom}/>:<div className={rooms.length?'empty':'empty wedding-empty'}>{rooms.length?<Search size={30} aria-hidden="true"/>:<WeddingArt kind="stay" className="wedding-empty-art"/>}<h2>{rooms.length?'No rooms found':'A room for every guest'}</h2><p>{rooms.length?'Try a different name or give your filters a little more room.':'Create an area and add your rooms to get started.'}</p><button className="button secondary" onClick={resetFilters}>Clear search & filters</button></div>}
 </>;
}


function CompactRooms({rooms,onOpen}: {rooms:Room[];onOpen:(room:Room)=>void}) {
 const {labels}=useContext(LabelsContext);
 const areas=useContext(AreasContext);
 return <div className="compact-overview"><div className="compact-legend"><span>ROOM ALLOCATION AT A GLANCE</span><div>{statuses.map(status=><span key={status}><i className={'dot '+statusClass(status)}/>{status}</span>)}</div></div>{areas.map(area=>{
 const subset=rooms.filter(room=>room.areaId===area.id);if(!subset.length)return null;
 return <section key={area.id} className="compact-area" aria-label={area.name+' room grid'}><div className="compact-area-heading"><h2>{areaIcon(area.id)}{area.name}</h2><span>{subset.length} {subset.length===1?'room':'rooms'} · {subset.filter(room=>room.booked!==false&&statusOf(room)==='Available').length} available</span></div><div className="room-cell-grid">{subset.map(room=>{
 const status=statusOf(room);const notBooked=room.booked===false&&!room.overdue;const allocation=room.allocation;const label=labels.find(l=>l.id===allocation?.labelId);
 const occupants=allocation?.headcountPending?'Guest count unknown':allocation?[...allocation.names, ...(allocation.unnamed?['+'+allocation.unnamed]:[])].join(', '):'No allocation';
 return <button key={room.id} className={'room-cell '+(notBooked?'not-booked':statusClass(status))} onClick={()=>onOpen(room)} aria-label={'Room '+room.number+', '+stayStatus(status)+', '+(allocation?.group||occupants)+', '+countOf(allocation)+' of '+room.capacity+' guests, '+(allocation?.arrived||0)+' arrived'} title={room.number+' · '+(room.special||room.type)+'\n'+(allocation?.group||'Available')+'\n'+occupants}><div className="cell-top"><strong>{room.number}</strong><span>{room.special?<Sparkles size={12}/>:room.type==='Suite'?<BedDouble size={12}/>:null}{room.special||room.type}</span></div><span className="cell-status"><i/>{notBooked?'Not booked for this date':stayStatus(status)}</span><div className="cell-group">{allocation?.group||(allocation?'Your guests':notBooked?'Choose other stay dates':'Ready to allocate')}</div>{label&&<span className="allocation-label cell-label" title={label.name}><Tag size={10}/>{label.name}</span>}<div className="cell-names">{allocation?occupants:'No guests assigned'}</div><div className="cell-bottom"><span><Users size={12}/>{allocation?.headcountPending?'Count unknown':countOf(allocation)+'/'+room.capacity}</span><span>{allocation?allocation.arrived+' arrived':notBooked?'View stays':'Assign room +'} </span></div></button>;
 })}</div></section>;
 })}</div>;
}

function RoomHistory({room,data,onRecover}: {room:Room;data:Dataset;onRecover:(eventId:string)=>Promise<string|null>}) {
 const [confirm,setConfirm]=useState<HistoryEntry|null>(null),[error,setError]=useState('');
 const events=data.history.filter(e=>e.roomId===room.id||e.destinationRoomId===room.id).slice().reverse();
 const recoveryLabel=(e:HistoryEntry)=>e.action==='checked-in'?'Undo check-in':e.action==='checked-out'?'Undo checkout':'Restore cancelled stay';
 return <div className="room-history"><p className="inventory-hint">A record of this room’s stays and changes. Earlier stays are kept here after cancellation or checkout.</p>{!events.length&&<div className="history-empty"><History size={25}/><h3>A fresh start</h3><p>New allocation activity will appear here. Earlier activity was not recorded.</p></div>}{events.map(event=>{
 const before=event.before?.find(r=>r.id===room.id)||event.roomSnapshot,after=event.after?.find(r=>r.id===room.id);
 const allocation=after?.allocation||before?.allocation;
 const oldStay=before?.allocation,newStay=after?.allocation;
 const edits=oldStay&&newStay?[
 oldStay.group!==newStay.group?'Group: '+(oldStay.group||'None')+' → '+(newStay.group||'None'):null,
 oldStay.checkIn!==newStay.checkIn||oldStay.checkOut!==newStay.checkOut?'Dates: '+stayDates(oldStay.checkIn,oldStay.checkOut)+' → '+stayDates(newStay.checkIn,newStay.checkOut):null,
 countOf(oldStay)!==countOf(newStay)||oldStay.headcountPending!==newStay.headcountPending?'Guest count: '+(oldStay.headcountPending?'Unknown':countOf(oldStay))+' → '+(newStay.headcountPending?'Unknown':countOf(newStay)):null,
 oldStay.names.join('\n')!==newStay.names.join('\n')?'Guest names updated':null,
 oldStay.labelId!==newStay.labelId?'Label updated':null,
 oldStay.contact!==newStay.contact?'Contact updated':null,
 oldStay.notes!==newStay.notes?'Notes updated':null
 ].filter(Boolean):[];
 const label=allocation?.labelId?event.labelNames?.[allocation.labelId]:undefined;
 const recoverable=['checked-in','checked-out','allocation-cancelled'].includes(event.action);
 const reason=recoverable?recoveryReason(data,event):null;
 return <article className="history-event" key={event.id}><span className="history-dot"/><div className="history-event-title"><h3>{(historyTitles[event.action]||event.action.replaceAll('-',' ')).replace('Allocation','Stay')}</h3><time dateTime={event.at}>{new Date(event.at).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div><p className="history-room-reference">Room {event.roomNames?.[room.id]||before?.number||room.number}{event.areaNames?.[(after||before||room).areaId]?' · '+event.areaNames[(after||before||room).areaId]:''}</p>{event.destinationRoomId&&<p className="history-move">{event.roomNames?.[event.roomId||'']||event.roomSnapshot?.number||'Previous room'} <ArrowRight size={12}/> {event.roomNames?.[event.destinationRoomId]||data.rooms.find(r=>r.id===event.destinationRoomId)?.number||'Destination room'}</p>}{allocation&&<><strong className="history-group">{allocation.group||'Your guests'}</strong>{label&&<span className="allocation-label"><Tag size={10}/>{label}</span>}<p className="history-guests">{[...allocation.names,...(allocation.unnamed?['+'+allocation.unnamed+' unnamed']:[])].join(', ')}</p><p className="history-count">{allocation.checkIn&&allocation.checkOut&&<>{stayDates(allocation.checkIn,allocation.checkOut)} · </>}{allocation.headcountPending?'Guest count unknown':countOf(allocation)+' assigned'} · {before?.allocation?.arrived??0} → {after?.allocation?.arrived??(event.action==='checked-out'?0:allocation.arrived)} arrived</p><details><summary>More details</summary><div className="history-detail-grid"><span>Contact</span><span>{allocation.contact||'—'}</span><span>Notes</span><span>{allocation.notes||'—'}</span><span>Allocation ID</span><span>{allocation.id||'Older record'}</span><span>Created</span><span>{allocation.createdAt?new Date(allocation.createdAt).toLocaleString():'Not recorded'}</span></div></details>{event.action==='allocation-edited'&&edits.length>0&&<ul className="history-edits">{edits.map(edit=><li key={edit}>{edit}</li>)}</ul>}{event.action==='allocation-edited'&&before?.allocation&&after?.allocation&&<details><summary>Before this edit</summary><p className="history-guests">{before.allocation.group||'Your guests'} · {[...before.allocation.names,...(before.allocation.unnamed?['+'+before.allocation.unnamed]:[])].join(', ')}</p><p className="history-guests">Label: {event.labelNames?.[before.allocation.labelId||'']||'None'} · Contact: {before.allocation.contact||'—'}</p><p className="history-guests">{before.allocation.notes||'No notes'}</p></details>}</>}{recoverable&&<div className="history-recovery"><button className="button secondary" disabled={!!reason} onClick={()=>{setError('');setConfirm(event);}}><Undo2 size={13}/>{recoveryLabel(event)}</button>{reason&&<p>{reason}</p>}</div>}{event.action==='action-recovered'&&<p className="history-count">The original event remains in the record.</p>}</article>;
 })}{error&&<p className="field-error" role="alert">{error}</p>}{confirm&&<Confirm title={recoveryLabel(confirm)+'?'} text={`Restore the allocation state from before this action in room ${room.number}. Current capacity and room availability will be checked again.`} action="Restore previous state" onCancel={()=>setConfirm(null)} onConfirm={async()=>{const message=await onRecover(confirm.id);if(message)setError(message);setConfirm(null);}}/>}</div>;
}

function PdfDialog({data,context,initialScope,onClose}: {data:Dataset;context:ReportContext;initialScope:ReportScope;onClose:()=>void}) {
 const [options,setOptions]=useState<ReportOptions>({scope:initialScope,includeContact:false,includeNotes:false});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),ref=useDialog(onClose);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const selection=reportSelection(data,options,context);
 async function download(){
  if(busy||!selection.rooms.length)return;
  setBusy(true);setError('');setNotice('');
  try{const {doc,filename}=await generateReport(data,options,context);if(!active.current)return;await doc.save(filename,{returnPromise:true});if(active.current)setNotice('PDF download requested. It contains the saved data shown in this report.');}
  catch(e){if(active.current)setError(e instanceof Error?e.message:'The PDF could not be generated. Please try again.');}
  finally{if(active.current)setBusy(false);}
 }
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="pdf-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">A LITTLE CLARITY TO SHARE</p><h2 id="pdf-title">Room report · {stayDate(data.viewDate||data.wedding.defaultDate,true)}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close PDF export"><X size={20}/></button></div><div className="inventory-form pdf-dialog-body"><p className="inventory-hint">A downloadable PDF, grouped by property and area for the selected night. Full-stay availability is checked separately in bulk allocation.</p><fieldset className="pdf-scope" disabled={busy}><legend>Choose your rooms</legend>{([{value:'all',title:'All booked rooms',description:'All booked rooms and overdue occupancy exceptions for the selected night.'},{value:'current',title:'Current results',description:'Use current property, area, linked guest, search and room filters for booked rooms.'},{value:'available',title:'Available rooms',description:'Rooms available for the selected night across all properties.'}] as const).map(scope=><label key={scope.value} className={options.scope===scope.value?'selected':''}><input type="radio" name="report-scope" value={scope.value} checked={options.scope===scope.value} onChange={()=>{setOptions({...options,scope:scope.value});setError('');setNotice('');}}/><span><strong>{scope.title}</strong><small>{scope.description}</small></span></label>)}</fieldset><section className="pdf-selection"><strong>{selection.rooms.length} {selection.rooms.length===1?'room':'rooms'} to export</strong><p>{selection.totals.assigned} assigned guests · {selection.totals.arrived} arrived</p>{selection.descriptions.map((description,i)=><p className="pdf-filter-description" key={i}>{description}</p>)}{!selection.rooms.length&&<p className="field-error">No rooms match. Choose another scope or change your filters.</p>}</section><div className="pdf-optional"><p className="eyebrow">OPTIONAL DETAILS</p><label><input type="checkbox" disabled={busy} checked={options.includeContact} onChange={e=>setOptions({...options,includeContact:e.target.checked})}/><span>Include contact numbers</span></label><label><input type="checkbox" disabled={busy} checked={options.includeNotes} onChange={e=>setOptions({...options,includeNotes:e.target.checked})}/><span>Include allocation notes</span></label></div>{error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="data-notice" role="status">{notice}</p>}{busy&&<p className="inventory-hint" role="status">Preparing your report…</p>}</div><div className="inventory-dialog-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" disabled={busy||!selection.rooms.length} onClick={()=>void download()}><FileDown size={15}/>{busy?'Generating…':'Download PDF'}</button></div></div></div>;
}

function DataDialog({data,onClose,onPdf,modeBlocked=false}:{data:Dataset;onClose:()=>void;onPdf?:()=>void;modeBlocked?:boolean}){
 const cloud=useCloud();const [replacing,setReplacing]=useState(false),[error,setError]=useState('');const close=()=>{if(!replacing&&!cloud.offline.busy)onClose();};const ref=useDialog(close);
 function download(){cloud.exportCopy();}

 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="data-title" tabIndex={-1}><div className="inventory-dialog-header"><h2 id="data-title">Your shared wedding</h2><button className="icon-button" aria-label="Close data menu" onClick={close} disabled={replacing||cloud.offline.busy}><X size={20}/></button></div><div className="inventory-form data-dialog-body"><p>{cloud.user.email} · {cloud.role}</p><p className="inventory-hint">{syncLabels[cloud.status]}. Last successful sync: {cloud.lastSyncedAt?new Date(cloud.lastSyncedAt).toLocaleString():'Not recorded for this older copy'}. Revision: {cloud.snapshot.revision}.</p>{onPdf&&<section className="data-option"><h3>Allocation PDF</h3><p>Share room details for this stay night.</p><button className="button secondary" onClick={onPdf}>Download PDF</button></section>}<section className="data-option"><h3>Export JSON</h3><p>{cloud.workMode==='offline'?'Download your complete local working copy, including unsynced changes.':'Download the latest complete saved cloud snapshot.'}</p><button className="button primary" onClick={download}><Download size={15}/>Export data</button></section><section className="data-option"><h3>{cloud.workMode==='offline'?'Offline workspace':'Work at your own pace'}</h3><OfflineModeControls disabled={replacing||modeBlocked}/></section>{cloud.role==='owner'&&<CategoryImport disabled={replacing||cloud.offline.busy} onBusyChange={setReplacing}/>}{cloud.role==='owner'&&<CloudReplacement disabled={replacing||cloud.workMode==='offline'} onBusyChange={setReplacing}/>}<section className="data-option"><h3>Sync details</h3><p>Observed activity for this browser session, not Firebase’s billed-read total. These counters do not include security-rule or metadata reads.</p><dl className="sync-diagnostics"><div><dt>Complete loads</dt><dd>{cloud.diagnostics.fullLoads}</dd></div><div><dt>Incremental loads</dt><dd>{cloud.diagnostics.incrementalLoads}</dd></div><div><dt>Record documents returned</dt><dd>{cloud.diagnostics.returnedDocuments}</dd></div><div><dt>Cache restores</dt><dd>{cloud.diagnostics.cacheRestores}</dd></div></dl>{cloud.cacheWarning&&<p className="field-error">{cloud.cacheWarning}</p>}<button className="button secondary" disabled={replacing||cloud.workMode==='offline'||cloud.status==='checking'||cloud.status==='syncing'} onClick={cloud.retryConnection}>Retry connection</button></section>{cloud.role==='owner'&&<section className="data-option"><h3>Coordinator access</h3><p>Approve coordinator accounts through Firebase console membership records. Their sign-in screen displays the account ID needed for approval.</p><a className="text-link" href="https://console.firebase.google.com/project/weddingstay-d0be2/firestore/databases/-default-/data" target="_blank" rel="noreferrer">Open Firebase console<ArrowUpRight size={15}/></a></section>}{error&&<p className="field-error">{error}</p>}</div><div className="inventory-dialog-footer"><button className="button secondary" onClick={close} disabled={replacing||cloud.offline.busy}>Done</button></div></div></div>;
}

function LabelsManager({rooms,onClose}: {rooms:Room[];onClose:()=>void}) {
 const {labels,saveLabel,deleteLabel}=useContext(LabelsContext);
 const [name,setName]=useState(''),[editingId,setEditingId]=useState<string|undefined>(),[error,setError]=useState('');
 const [deleting,setDeleting]=useState<AllocationLabel|null>(null);
 const ref=useDialog(onClose);
 const reset=()=>{setName('');setEditingId(undefined);setError('');};
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="labels-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">KEEP YOUR PEOPLE TOGETHER</p><h2 id="labels-title">Allocation labels</h2></div><button className="icon-button" aria-label="Close labels" onClick={onClose}><X size={20}/></button></div><div className="inventory-form labels-body"><p className="inventory-hint">One label can connect several room allocations. Family and guest details stay separate.</p><form className="allocation-form label-manager-form" onSubmit={async e=>{e.preventDefault();const result=await saveLabel(name,editingId);if(result.error)setError(result.error);else reset();}}><label>{editingId?'Rename label':'Create a label'}<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Groom’s relatives"/></label><div className="label-manager-actions">{editingId&&<button type="button" className="button secondary" onClick={reset}>Cancel rename</button>}<button className="button primary" type="submit">{editingId?'Save name':'Create label'}</button></div></form>{error&&<p className="field-error" role="alert">{error}</p>}<div className="label-list">{labels.length?labels.map(label=><div className="label-list-row" key={label.id}><div><span className="allocation-label"><Tag size={12}/>{label.name}</span><small>{rooms.filter(r=>r.allocation?.labelId===label.id).length} allocations</small></div><button className="icon-button" aria-label={'Rename '+label.name} onClick={()=>{setEditingId(label.id);setName(label.name);setError('');}}><Pencil size={15}/></button><button className="icon-button danger" aria-label={'Delete '+label.name} onClick={()=>setDeleting(label)}><Trash2 size={15}/></button></div>):<p className="inventory-hint">No labels yet. Create your first one above or while allocating a room.</p>}</div></div><div className="inventory-dialog-footer"><button className="button secondary" onClick={onClose}>Done</button></div></div>
 {deleting&&<Confirm title={'Remove “'+deleting.name+'”?'} text={`This removes the label from ${rooms.filter(r=>r.allocation?.labelId===deleting.id).length} allocations. All rooms, guests and allocations will be kept.`} action="Remove label" onCancel={()=>setDeleting(null)} onConfirm={async()=>{const message=await deleteLabel(deleting.id);if(message)setError(message);else if(editingId===deleting.id)reset();setDeleting(null);}}/>}
 </div>;
}

function InventoryEditor({target,rooms,properties,onSave,onDelete,onClose}: {target:InventoryTarget;rooms:Room[];properties:Dataset['properties'];onSave:(value:Area|Room)=>Promise<string|null>;onDelete:(value:Area|Room)=>Promise<string|null>;onClose:()=>void}) {
 const areas=useContext(AreasContext);
 const isRoom=target.kind==='room';
 const existing=target.kind==='room'?target.room:target.area;
 const [draft,setDraft]=useState<Area|Room>(()=>existing?structuredClone(existing):isRoom?{id:crypto.randomUUID(),number:'',areaId:target.kind==='room'?(target.areaId||areas[0]?.id||''):'',type:'Normal',capacity:4,notes:''}:{id:crypto.randomUUID(),propertyId:target.kind==='area'?(target.propertyId||properties[0]?.id||''):properties[0]?.id||'',name:'',description:'',motif:['main','garden','courtyard','poolside'][areas.length%4]});
 const baseline=useRef(JSON.stringify(draft));
 const dirty=JSON.stringify(draft)!==baseline.current;
 const [confirmation,setConfirmation]=useState<'discard'|'delete'|null>(null);
 const [error,setError]=useState('');
 const close=()=>{if(dirty)setConfirmation('discard');else onClose();};
 const ref=useDialog(close);
 const room='number' in draft?draft:null;
 const area='name' in draft?draft:null;
 const blocked=room?!!room.allocation:rooms.some(r=>r.areaId===draft.id);
 async function submit(e:React.FormEvent){e.preventDefault();const cleaned=room?{...room,number:room.number.trim(),notes:room.notes?.trim()}:area?{...area,name:area.name.trim(),description:area.description.trim()}:draft;const message=await onSave(cleaned);if(message)setError(message);else onClose();}
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="inventory-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">YOUR WEDDING SPACE</p><h2 id="inventory-title">{existing?'Edit':'Add'} {isRoom?'room':'area'}</h2></div><button className="icon-button" onClick={close} aria-label="Close inventory editor"><X size={20}/></button></div><form className="allocation-form inventory-form" id="inventory-form" onSubmit={submit}>
 {area&&<><label>Property<select required value={area.propertyId} onChange={e=>setDraft({...area,propertyId:e.target.value})}>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Area name<input autoFocus required value={area.name} placeholder="e.g. Garden Wing" onChange={e=>setDraft({...area,name:e.target.value})}/></label><label>Description <span>optional</span><textarea rows={2} value={area.description} placeholder="A little about this part of the venue" onChange={e=>setDraft({...area,description:e.target.value})}/></label></>}
 {room&&<><label>Room number<input autoFocus required value={room.number} placeholder="e.g. 141 or A-01" onChange={e=>setDraft({...room,number:e.target.value})}/></label><label>Area<select value={room.areaId} required onChange={e=>setDraft({...room,areaId:e.target.value})}><option value="" disabled>Choose an area</option>{areas.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><div className="form-columns"><label>Room type<select value={room.type} onChange={e=>setDraft({...room,type:e.target.value as Room['type'],special:e.target.value==='Normal'?undefined:room.special})}><option>Normal</option><option>Suite</option></select></label><label>Maximum occupancy<input required type="number" min={1} step={1} value={room.capacity||''} onChange={e=>setDraft({...room,capacity:Number(e.target.value)})}/></label></div>{room.allocation&&<p className="inventory-hint">{countOf(room.allocation)} guests are assigned. Capacity must accommodate everyone.</p>}{room.type==='Suite'&&<label>Special designation<select value={room.special||''} onChange={e=>setDraft({...room,special:e.target.value||undefined})}><option value="">None</option><option>Bride Suite</option><option>Groom Suite</option></select></label>}<label>Room notes <span>optional</span><textarea rows={3} value={room.notes||''} placeholder="Floor, accessibility or other useful details" onChange={e=>setDraft({...room,notes:e.target.value})}/></label></>}
 {error&&<p role="alert" className="field-error">{error}</p>}
 {existing&&<div className="inventory-delete"><button type="button" disabled={blocked} onClick={()=>setConfirmation('delete')} className="quiet-button danger"><Trash2 size={14}/>Delete {isRoom?'room':'area'}</button>{blocked&&<p>{isRoom?'End the active allocation before deleting this room.':'Move or remove all rooms before deleting this area.'}</p>}</div>}
 </form><div className="inventory-dialog-footer"><button className="button secondary" onClick={close}>Cancel</button><button className="button primary" type="submit" form="inventory-form"><Check size={16}/>Save {isRoom?'room':'area'}</button></div></div>
 {confirmation&&<Confirm title={confirmation==='discard'?'Discard unsaved changes?':`Delete ${room?'room '+room.number:area?.name}?`} text={confirmation==='discard'?'These details have not been saved.':'This removes it from your current inventory. This action cannot be undone.'} action={confirmation==='discard'?'Discard changes':'Delete'} onCancel={()=>setConfirmation(null)} onConfirm={async()=>{if(confirmation==='discard')onClose();else{const message=await onDelete(draft);if(message){setError(message);setConfirmation(null);}else onClose();}}}/>}
 </div>;
}



const router=(import.meta.env.MODE==='pages'?createHashRouter:createBrowserRouter)([{path:'*',element:<CloudAccess><App/></CloudAccess>}]);
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
