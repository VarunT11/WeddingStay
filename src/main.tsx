import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider, useLocation, useNavigate as useRouterNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BedDouble, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, DoorOpen, Flower2, Heart, LayoutDashboard, Leaf, MapPin, Minus, Plus, Pencil, Trash2, Tag, ArrowRightLeft, Database, Download, Upload, History, Undo2, FileDown, Search, SlidersHorizontal, Sparkles, Users, Waves, X } from 'lucide-react';
import { countOf, initialData, validateData, createHistoryEvent, recoverAction, recoveryReason, historyTitles, filterRooms, statusOf, summary, STORAGE_KEY, type Area, type AllocationLabel, type Dataset, type Room, type Status, type HistoryEntry } from './data';
import {parseDataset,serializeDataset,exportFilename,transferPreview} from './transfer';
import {generateReport, reportSelection, type ReportContext, type ReportOptions, type ReportScope} from './reports';
import {useOfflineApp} from './pwa';
import './styles.css';
import {Stays} from './Stays';
import {plannedNightDates} from './stayNights';
import {areaPath,propertyPath,nightPath,parseStayRoute,legacyStayTarget} from './stayRoutes';
import {BulkAllocation} from './RoomPlanning';
import {DashboardExtras} from './DashboardExtras';
import {StayPanel} from './StayPanel';
import {DateContext,Link,NavLink,useNavigate,dated} from './navigation';
import {projectData,isDate,localToday,nextDay} from './data';
import {PeopleEvents} from './PeopleEvents';
import {Confirm,useDialog} from './dialogs';
import {CalendarDays} from 'lucide-react';
import {emptyDataset,normalizeData,storedData,MigrationRequired,migrateLegacy,seed,type LegacyDataset,type MigrationSettings} from './data';

const AreasContext=createContext<Area[]>([]);
const PropertiesContext=createContext<Dataset['properties']>([]);
const GuestsContext=createContext<Dataset['guests']>([]);
type LabelResult = {id?:string;error?:string};
const LabelsContext=createContext<{labels:AllocationLabel[];saveLabel:(name:string,id?:string)=>LabelResult;deleteLabel:(id:string)=>string|null}>({labels:[],saveLabel:()=>({error:'Unavailable'}),deleteLabel:()=>null});
type InventoryTarget = {kind:'area';area?:Area;propertyId?:string}|{kind:'room';room?:Room;areaId?:string};
const statuses: Status[] = ['Available', 'Allotted', 'Occupied'];
const statusClass = (s: string) => s.toLowerCase();
const areaIcon = (id: string) => id === 'garden' ? <Leaf/> : id === 'poolside' ? <Waves/> : id === 'main' ? <DoorOpen/> : <Flower2/>;
function Badge({status}: {status: Status}) { return <span className={`badge ${statusClass(status)}`}><i/>{status}</span>; }
function App() {
  const offline=useOfflineApp();
  const [laterUpdate,setLaterUpdate]=useState(false);
  const [confirmUpdate,setConfirmUpdate]=useState(false);
  const [load] = useState(() => { try { return {data: initialData(), error: '',legacy:null as LegacyDataset|null}; } catch(e) { return {data:emptyDataset(),error:e instanceof Error?e.message:'Local storage is unavailable.',legacy:e instanceof MigrationRequired?e.legacy:null}; } });
  const [savedData, setData] = useState(load.data);
  const [migration,setMigration]=useState(load.legacy);
  const [error,setError] = useState(load.error);
  useEffect(()=>{if(load.error)return;try{if(!localStorage.getItem(STORAGE_KEY))localStorage.setItem(STORAGE_KEY,JSON.stringify(storedData(load.data)));}catch{setError('Reference data could not be saved on this device. Keep this page open and try again.');}},[load]);
  const [toast,setToast] = useState('');
  const [inventory,setInventory] = useState<InventoryTarget|null>(null);
  const [manageLabels,setManageLabels]=useState(false);
  const [dataDialog,setDataDialog]=useState(false);
  const [pdfScope,setPdfScope]=useState<ReportScope|null>(null);
  const location = useLocation(); const rawNavigate = useRouterNavigate(); const [params] = useSearchParams();
  const [rememberedDate,setRememberedDate]=useState(()=>{try{const d=localStorage.getItem('weddingstay.selectedDate');return d&&isDate(d)?d:load.data.wedding.defaultDate;}catch{return load.data.wedding.defaultDate;}});
  const stayRoute=parseStayRoute(location.pathname);
  const requestedDate=params.get('date'),selectedDate=stayRoute.date||(requestedDate&&isDate(requestedDate)?requestedDate:rememberedDate);
  const legacyTarget=legacyStayTarget(location.pathname,params,savedData,selectedDate);
  const navigate:ReturnType<typeof useRouterNavigate>=((to:any,options?:any)=>typeof to==='number'?rawNavigate(to):rawNavigate(dated(to,selectedDate),options)) as ReturnType<typeof useRouterNavigate>;
  const data=projectData(savedData,selectedDate),areas=data.areas;
  const displayAreas=areas.map(a=>({...a,name:(data.properties.find(p=>p.id===a.propertyId)?.name||'Property')+' · '+a.name}));
  useEffect(()=>{setRememberedDate(selectedDate);try{localStorage.setItem('weddingstay.selectedDate',selectedDate);}catch{/* Browsing still works without preference storage. */}if(legacyTarget){void rawNavigate({...legacyTarget,hash:location.hash},{replace:true,state:location.state,preventScrollReset:true});}else if(requestedDate!==selectedDate){const p=new URLSearchParams(location.search);p.set('date',selectedDate);void rawNavigate({pathname:location.pathname,search:p.toString()},{replace:true,preventScrollReset:true,state:location.state});}},[selectedDate,requestedDate,location.pathname,location.search]);
  function changeDate(value:string){
    if(!isDate(value))return;const p=new URLSearchParams(params);p.set('date',value);let pathname=location.pathname;
    if(stayRoute.date){
      p.delete('room');p.delete('allocation');p.delete('propertyEdit');p.delete('requirementEdit');p.delete('bulk');p.delete('requirement');
      const booked=data.properties.find(property=>property.id===stayRoute.propertyId)?.bookedRanges.some(r=>r.checkIn<=value&&value<r.checkOut);
      pathname=stayRoute.propertyId&&booked?(stayRoute.areaId?areaPath(value,stayRoute.propertyId,stayRoute.areaId):propertyPath(value,stayRoute.propertyId)):nightPath(value);
      p.delete('property');p.delete('area');
    }
    navigate({pathname,search:p.toString()},{preventScrollReset:true,state:location.state});
  }
  const propertyFilter=stayRoute.propertyId||params.get('property')||'';
  const staysPage=location.pathname==='/stays'||location.pathname.startsWith('/stays/');
  const [globalQuery,setGlobalQuery] = useState('');
  const areaId = stayRoute.areaId;
  const area = areas.find(a => a.id === areaId);
  const managementKind=location.pathname==='/guests'?'guests':location.pathname==='/events'?'events':undefined;
  const managementOpen=!!(managementKind&&params.get(managementKind==='guests'?'guest':'event'));
  const page = staysPage?'Stays':managementKind==='guests'?'Guests':managementKind==='events'?'Events':location.pathname === '/' ? 'Dashboard' : location.pathname === '/areas' ? 'Areas' : area ? area.name : 'Browse rooms';
  const reportContext:ReportContext=(location.pathname==='/browse'||area)?{guest:params.get('guestGroup')||undefined,property:propertyFilter||undefined,area:area?.id||params.get('area')||undefined,status:params.get('status')||undefined,type:params.get('type')||undefined,query:params.get('q')||undefined,label:data.labels.some(l=>l.id===params.get('label'))?params.get('label')||undefined:undefined}:{};
  const bulkOpen=!managementKind&&params.get('bulk')==='1';
  const selectedRoom = managementKind||bulkOpen?undefined:data.rooms.find(r => r.id === params.get('room'));
  useEffect(() => { if (toast) { const id = window.setTimeout(()=>setToast(''),3500); return ()=>clearTimeout(id); } },[toast]);
  function save(next: Dataset, message: string) {
    try { next=normalizeData({...next,updatedAt:new Date().toISOString()});localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData(next))); setData(next); setError(''); setToast(message); return true; }
    catch { setError('Your changes could not be saved on this device. Please keep this page open and try again.'); return false; }
  }
  function recover(eventId:string):string|null {
    try{return save(recoverAction(data,eventId),'Original allocation restored')?null:'Could not save recovery. Current data has been kept.';}
    catch(e){return e instanceof Error?e.message:'Recovery is unavailable.';}
  }
  function importData(next:Dataset):boolean {
    if(!save(next,'Data imported successfully'))return false;
    setInventory(null);setManageLabels(false);setDataDialog(false);setPdfScope(null);navigate('/',{replace:true});return true;
  }
  function saveInventory(target:Area|Room):string|null {
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
    return save(next,'Details saved')?null:'Could not save on this device. Please try again.';
  }
  function deleteInventory(target:Area|Room):string|null {
    if('number' in target){
      if(data.allocations.some(a=>a.roomId===target.id))return 'This room has saved stays. Keep it to preserve their references.';
      return save({...data,rooms:data.rooms.filter(r=>r.id!==target.id)},'Room deleted')?null:'Could not save the deletion.';
    }
    if(data.rooms.some(r=>r.areaId===target.id))return 'Move or remove all rooms before deleting this area.';
    return save({...data,areas:areas.filter(a=>a.id!==target.id)},'Area deleted')?null:'Could not save the deletion.';
  }
  function saveLabel(rawName:string,id?:string):LabelResult {
    const name=rawName.trim();
    if(!name)return {error:'Enter a label name.'};
    if(data.labels.some(label=>label.id!==id&&label.name.trim().toLowerCase()===name.toLowerCase()))return {error:'A label with this name already exists. Choose it from the list.'};
    const now=new Date().toISOString(), previous=data.labels.find(label=>label.id===id);
    if(id&&!previous)return {error:'This label no longer exists.'};
    const label:AllocationLabel={id:id||crypto.randomUUID(),name,createdAt:previous?.createdAt||now,updatedAt:now};
    const next={...data,labels:id?data.labels.map(l=>l.id===id?label:l):[...data.labels,label]};
    return save(next,id?'Label renamed':'Label created')?{id:label.id}:{error:'Could not save this label. Please try again.'};
  }
  function deleteLabel(id:string):string|null {
    if(data.requirements.some(r=>r.labelId===id))return 'This label has room requirements. Remove those requirements before deleting the label.';
    const now=new Date().toISOString();
    const updatedRooms=data.rooms.map(room=>room.allocation?.labelId===id?{...room,updatedAt:now,allocation:{...room.allocation,labelId:undefined,updatedAt:now}}:room);
    const events=data.rooms.filter(room=>room.allocation?.labelId===id).map(room=>createHistoryEvent(data,'allocation-edited',[room],[updatedRooms.find(r=>r.id===room.id)!]));
    const next={...data,labels:data.labels.filter(l=>l.id!==id),allocations:data.allocations.map(a=>a.labelId===id?{...a,labelId:undefined,updatedAt:now}:a),rooms:updatedRooms,history:[...data.history,...events]};
    if(!save(next,'Label removed; allocations kept'))return 'Could not remove this label.';
    if(params.get('label')===id){const p=new URLSearchParams(params);p.delete('label');navigate({pathname:location.pathname,search:p.toString()},{replace:true,preventScrollReset:true});}
    return null;
  }
  const closeRoom = () => { const back = location.state as {roomOverlay?: boolean} | null; if (back?.roomOverlay) navigate(-1); else { const p = new URLSearchParams(params); p.delete('room');p.delete('allocation'); navigate({pathname:location.pathname,search:p.toString()},{replace:true}); } };
  const operationalRooms=data.rooms.filter(r=>r.booked!==false||r.overdue);
  const totals = summary(operationalRooms);
  const calendarControls=location.pathname==='/'||location.pathname==='/browse';
  const nestedNight=!!stayRoute.date;
  const plannedDates=nestedNight?plannedNightDates(savedData):[];
  const previousNight=plannedDates.filter(date=>date<selectedDate).at(-1),nextNight=plannedDates.find(date=>date>selectedDate);
  return <DateContext.Provider value={selectedDate}><PropertiesContext.Provider value={data.properties}><GuestsContext.Provider value={data.guests}><AreasContext.Provider value={displayAreas}><LabelsContext.Provider value={{labels:data.labels,saveLabel,deleteLabel}}><div className="app-shell">
    <aside className="sidebar"><Link className="brand" to="/"><span className="brand-mark"><Flower2 size={25}/></span><span>WeddingStay<small>ROOM FOR CELEBRATION</small></span></Link>
      <div className="nav-label">YOUR WEDDING SPACE</div><nav>{[["/","Dashboard",<LayoutDashboard/>],["/guests","Guests",<Users/>],["/events","Events",<CalendarDays/>],["/stays","Stays",<BedDouble/>],["/browse","Browse rooms",<BedDouble/>]].map(([to,label,icon])=><NavLink key={String(to)} to={String(to)} end={to==='/'}>{icon}<span>{label}</span>{to==='/areas' && <em>{areas.length}</em>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="celebration-note"><Heart size={20}/><p>A little less coordinating.<br/><strong>A little more celebrating.</strong></p><span>{data.wedding.name}</span></div><div className="profile"><span>Y</span><div>Your wedding space<small>Personal · saved on this device</small></div></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Your wedding <ChevronRight size={14}/><span>{page}</span></div><form className="global-search" onSubmit={e=>{e.preventDefault();navigate('/browse?q='+encodeURIComponent(globalQuery));setGlobalQuery('');}}><Search size={17}/><input aria-label="Search all rooms and guests" placeholder="Find a room, family or guest…" value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)}/><kbd>↵</kbd></form><button className="button secondary data-menu-button" onClick={()=>setDataDialog(true)}><Database size={15}/>Data</button><span className="sample-badge"><i/>Saved locally</span><span className="avatar">Y</span></header>
      <main key={location.pathname} className="page-enter">
        {offline.enabled&&<div className={'offline-banner '+(offline.ready?'ready':'')} role="status"><span><CheckCheck size={14}/>{offline.error|| (offline.ready?'Ready for offline use':'Preparing offline use… keep the app connected')}</span>{offline.needRefresh&&!laterUpdate&&<div className="offline-update"><span>App update available</span><button disabled={!!(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||dataDialog||pdfScope)} onClick={()=>setConfirmUpdate(true)}>Reload to update</button><button onClick={()=>setLaterUpdate(true)}>Later</button>{(selectedRoom||managementOpen||params.has('propertyEdit')||params.has('requirementEdit')||bulkOpen||inventory||manageLabels||dataDialog||pdfScope)&&<small>Close open dialogs before updating.</small>}</div>}</div>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="context-banner date-context"><div><span>{data.referenceData?'Fictional reference data':'Your wedding data'}</span>{nestedNight?<h2 className="night-context-title">Night of {new Date(selectedDate+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</h2>:<small>{calendarControls?'Room availability follows the selected night.':'Master records cover all planned nights.'}</small>}</div>{calendarControls&&<div className="date-controls"><button className="icon-button" aria-label="Previous day" onClick={()=>changeDate(nextDay(selectedDate,-1))}><ChevronLeft size={17}/></button><label>Selected night<input type="date" required value={selectedDate} onChange={e=>changeDate(e.target.value)}/></label><button className="icon-button" aria-label="Next day" onClick={()=>changeDate(nextDay(selectedDate))}><ChevronRight size={17}/></button><button className="button secondary" onClick={()=>changeDate(localToday())}>Today</button></div>}{nestedNight&&<div className="planned-night-controls" aria-label="Planned night navigation"><button className="button secondary" disabled={!previousNight} onClick={()=>previousNight&&changeDate(previousNight)}><ChevronLeft size={17}/>Previous night</button><button className="button secondary" disabled={!nextNight} onClick={()=>nextNight&&changeDate(nextNight)}>Next night<ChevronRight size={17}/></button></div>}{calendarControls&&totals.pending>0&&<span>{totals.pending} reservations with headcount pending</span>}</div>
        {legacyTarget ? <p className="inventory-hint">Opening your stay…</p> : staysPage ? <Stays data={data} commit={save} onAddArea={propertyId=>setInventory({kind:'area',propertyId})} renderAreas={propertyId=><div className="area-grid master">{areas.filter(a=>a.propertyId===propertyId).map(a=><AreaCard key={a.id} areaId={a.id} rooms={data.rooms} onEdit={()=>setInventory({kind:'area',area:a})}/>)}</div>} renderRooms={id=><RoomBrowser rooms={data.rooms} areaId={id} onManageLabels={()=>setManageLabels(true)} onPdf={()=>setPdfScope('current')} onAddRoom={()=>setInventory({kind:'room',areaId:id})} onEditArea={()=>setInventory({kind:'area',area:areas.find(a=>a.id===id)!})}/>}/> : managementKind ? <PeopleEvents key={managementKind} kind={managementKind} data={data} commit={save}/> : location.pathname === '/' ? <Dashboard rooms={operationalRooms} totals={totals} data={data}/> : <RoomBrowser rooms={data.rooms} areaId={area?.id} onManageLabels={()=>setManageLabels(true)} onPdf={()=>setPdfScope('current')} onAddRoom={()=>setInventory({kind:'room',areaId:area?.id||areas.find(a=>a.propertyId===propertyFilter)?.id})} onEditArea={area?()=>setInventory({kind:'area',area}):undefined}/>}
        <footer><Flower2 size={14}/><span>Made for the moments that matter.</span><span>WeddingStay · {data.wedding.name}</span></footer>
      </main>
    </div>
    <nav className="mobile-nav"><NavLink end to="/"><LayoutDashboard/><span>Dashboard</span></NavLink><NavLink to="/guests"><Users/><span>Guests</span></NavLink><NavLink to="/events"><CalendarDays/><span>Events</span></NavLink><NavLink to="/stays"><BedDouble/><span>Stays</span></NavLink><NavLink to="/browse"><BedDouble/><span>Browse</span></NavLink></nav>
    {selectedRoom && <StayPanel key={selectedRoom.id+'-'+selectedDate+'-'+(params.get('allocation')||'view-'+(selectedRoom.allocation?.id||'empty'))} room={selectedRoom} data={data} selection={params.get('allocation')||undefined} prefillLabelId={params.get('label')||undefined} commit={save} onClose={closeRoom} onEditRoom={()=>setInventory({kind:'room',room:selectedRoom})} onSelect={(id,roomId)=>{const p=new URLSearchParams(params);p.set('allocation',id);if(roomId)p.set('room',roomId);navigate({pathname:location.pathname,search:p.toString()},{replace:true,state:location.state,preventScrollReset:true});}} history={<RoomHistory room={selectedRoom} data={data} onRecover={recover}/>}/>}

    {bulkOpen&&<BulkAllocation data={data} commit={save} onClose={()=>{if((location.state as {bulkOverlay?:boolean}|null)?.bulkOverlay)navigate(-1);else{const p=new URLSearchParams(params);p.delete('bulk');p.delete('requirement');navigate({pathname:location.pathname,search:p.toString()},{replace:true,state:location.state,preventScrollReset:true});}}}/>}
    {inventory&&<InventoryEditor key={inventory.kind+(inventory.kind==='room'?inventory.room?.id||'new':inventory.area?.id||'new')} target={inventory} rooms={data.rooms} properties={data.properties} onSave={saveInventory} onDelete={deleteInventory} onClose={()=>setInventory(null)}/>}
    {manageLabels&&<LabelsManager rooms={data.rooms} onClose={()=>setManageLabels(false)}/>}
    {dataDialog&&<DataDialog data={data} onImport={importData} onPdf={()=>{setDataDialog(false);setPdfScope('all');}} onClose={()=>setDataDialog(false)}/>}
    {pdfScope&&<PdfDialog data={data} context={reportContext} initialScope={pdfScope} onClose={()=>setPdfScope(null)}/>}
    {migration&&<MigrationSetup legacy={migration} onReady={next=>{if(save(next,'Existing data migrated successfully')){setMigration(null);return true;}return false;}}/>}
    {confirmUpdate&&<Confirm title="Apply the app update?" text="Saved allocations will stay on this device. The app will reload with the new version." action="Reload & update" onCancel={()=>setConfirmUpdate(false)} onConfirm={()=>{setConfirmUpdate(false);void offline.update();}}/>}
    {toast && <div role="status" className="toast"><CheckCheck size={18}/>{toast}</div>}
  </div></LabelsContext.Provider></AreasContext.Provider></GuestsContext.Provider></PropertiesContext.Provider></DateContext.Provider>;
}
function PageTitle({eyebrow,title,description,action}: {eyebrow:string;title:string;description:string;action?:React.ReactNode}) {return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;}
function Breakdown({rooms:inventory}: {rooms:Room[]}) {const rooms=inventory.filter(r=>r.booked!==false||r.overdue);const s=summary(rooms);return <div className="breakdown" aria-label={`${s.available} available, ${s.allotted} allotted, ${s.occupied} occupied`}>{statuses.map(st=><span key={st} className={statusClass(st)} style={{width:`${rooms.length ? rooms.filter(r=>statusOf(r)===st).length/rooms.length*100:0}%`}}/>)}</div>;}
function Dashboard({rooms,totals:s,data}: {rooms:Room[];totals:ReturnType<typeof summary>;data:Dataset}) {
 const areas=useContext(AreasContext);
  return <><PageTitle eyebrow={'THE WEDDING EDIT · '+(data.viewDate||data.wedding.defaultDate)} title="Every guest. A place to belong." description="Your celebration, a little more organised. Here’s how the stay is shaping up." action={<Link className="button primary" to="/browse"><Search size={17}/>Find a room<ArrowUpRight size={16}/></Link>}/>
    <div className="metric-grid">{[{label:'Total rooms',value:s.total,icon:<BedDouble/>,note:`Across ${areas.length} ${areas.length===1?'area':'areas'}`,url:'/browse',cls:'total'},{label:'Available',value:s.available,icon:<DoorOpen/>,note:'Ready for your guests',url:'/browse?status=Available',cls:'available'},{label:'Allotted',value:s.allotted,icon:<Users/>,note:'A welcome is waiting',url:'/browse?status=Allotted',cls:'allotted'},{label:'Occupied',value:s.occupied,icon:<CheckCheck/>,note:'Settled in & celebrating',url:'/browse?status=Occupied',cls:'occupied'}].map(m=><Link key={m.label} to={m.url} className={'metric '+m.cls}><div className="metric-top"><span>{m.label}</span><span className="metric-icon">{m.icon}</span></div><strong>{m.value.toString().padStart(2,'0')}</strong><div className="metric-bottom"><span>{m.note}</span><ArrowUpRight size={16}/></div></Link>)}</div>
    <div className="dashboard-middle"><section className="panel arrivals"><div className="section-heading"><h2>A warm welcome, in progress</h2><span className="subtle-icon"><Users size={19}/></span></div><div className="arrival-main"><span><strong>{s.arrived}</strong><span> / {s.assigned}</span></span><span className="pill">{s.assigned ? Math.round(s.arrived/s.assigned*100):0}% arrived</span></div><p className="muted">Guests checked in and ready to celebrate</p><div className="arrival-track"><span style={{width:`${s.assigned?s.arrived/s.assigned*100:0}%`}}/></div><div className="arrival-bottom"><span><i className="dot occupied"/>{s.arrived} arrived</span><span>{s.assigned-s.arrived} yet to arrive</span></div><div className="guest-stats"><div><span>Total capacity</span><strong>{s.capacity}<small>guests</small></strong></div><div><span>Assigned occupants</span><strong>{s.assigned}<small>guests</small></strong></div><div><span>Awaiting arrival</span><strong>{s.assigned-s.arrived}<small>guests</small></strong></div></div></section>
      <section className="panel room-snapshot"><div className="section-heading"><h2>Room snapshot</h2><BedDouble size={19}/></div><div className="snapshot-total"><strong>{s.total}</strong><span>rooms, thoughtfully arranged</span></div><Breakdown rooms={rooms}/><div className="snapshot-legend">{statuses.map(st=><Link key={st} to={'/browse?status='+st}><span><i className={'dot '+statusClass(st)}/>{st}</span><strong>{rooms.filter(r=>statusOf(r)===st).length}<ChevronRight size={14}/></strong></Link>)}</div></section></div>
    <DashboardExtras data={data}/><div className="section-heading area-heading"><div><h2>Your people. One celebration.</h2><p>Explore the areas and keep your people close.</p></div><Link className="text-link" to={nightPath(data.viewDate||data.wedding.defaultDate)}>Explore accommodation<ArrowRight size={16}/></Link></div><div className="area-grid">{areas.map(a=><AreaCard key={a.id} areaId={a.id} rooms={rooms}/>)}</div><Link className="available-banner" to="/browse?status=Available"><span className="banner-icon"><Sparkles/></span><div><strong>There’s room for more memories.</strong><p>{s.available} rooms are waiting for their guests. Let’s find the right one.</p></div><span className="text-link">View available rooms<ArrowRight size={17}/></span></Link>
  </>;
}
function AreaCard({areaId,rooms,onEdit}: {areaId:string;rooms:Room[];onEdit?:()=>void}) {
 const areas=useContext(AreasContext);
 const a=areas.find(a=>a.id===areaId)!;const date=useContext(DateContext),destination=areaPath(date,a.propertyId,a.id);const subset=rooms.filter(r=>r.areaId===areaId);const s=summary(subset);const navigate=useNavigate();
 return <article className={'area-card '+a.motif} onClick={e=>{if(!(e.target as HTMLElement).closest('a,button'))navigate(destination);}}>
 <Link className="area-art" to={destination} aria-label={'Explore '+a.name}><span className="area-art-icon">{areaIcon(a.id)}</span><span className="room-count">{subset.length} rooms</span><span className="art-arch one"/><span className="art-arch two"/><span className="art-line"/></Link>
 <div className="area-body"><Link className="area-title" to={destination}><h3>{a.name}</h3><ArrowUpRight size={17}/></Link><p>{a.description}</p>{subset.length>0&&subset.every(r=>r.booked===false&&!r.overdue)&&<p className="inventory-hint">Not booked for the selected date</p>}<Breakdown rooms={subset}/><div className="mini-status"><Link to={destination+'?status=Available'}><i className="dot available"/>{s.available} available</Link><span>{s.allotted} allotted</span><span>{s.occupied} occupied</span></div></div>
 <div className="area-card-footer"><span><Users size={14}/>{s.assigned} assigned · {s.arrived} arrived</span><Link to={destination} aria-label={'View rooms in '+a.name}><ArrowRight size={17}/></Link>{onEdit&&<button className="icon-button area-edit" onClick={onEdit} aria-label={'Edit '+a.name}><Pencil size={14}/></button>}</div></article>;
}

function RoomBrowser({rooms,areaId,onAddRoom,onEditArea,onManageLabels,onPdf}: {rooms:Room[];areaId?:string;onAddRoom:()=>void;onEditArea?:()=>void;onManageLabels:()=>void;onPdf:()=>void}) {
 const {labels}=useContext(LabelsContext);
 const properties=useContext(PropertiesContext);
 const guests=useContext(GuestsContext);
 const date=useContext(DateContext);
 const areas=useContext(AreasContext);
 const [params,setParams]=useSearchParams();const location=useLocation();const navigate=useNavigate();const a=areas.find(a=>a.id===areaId);const q=params.get('q')||''; const st=params.get('status')||''; const type=params.get('type')||'';const chosenArea=areaId||params.get('area')||'';const selectedLabel=labels.find(l=>l.id===params.get('label'));
 const propertyId=a?.propertyId||params.get('property')||'';
 const areaRooms=rooms.filter(r=>(!areaId||r.areaId===areaId)&&(!propertyId||r.propertyId===propertyId));const s=summary(areaRooms);
 const filtered=filterRooms(rooms,labels,{guest:params.get('guestGroup')||undefined,property:propertyId,area:chosenArea,status:st,type,query:q,label:selectedLabel?.id},guests);
 function filter(k:string,v:string){const p=new URLSearchParams(params);p.delete('room');if(v)p.set(k,v);else p.delete(k);setParams(p,{replace:true,preventScrollReset:true});}
 function openRoom(room:Room){scroll.current=window.scrollY;const p=new URLSearchParams(params);p.set('room',room.id);p.delete('allocation');navigate({pathname:location.pathname,search:p.toString()},{state:{roomOverlay:true},preventScrollReset:true});}
 const resetFilters=()=>{const p=new URLSearchParams();const d=params.get('date');if(d)p.set('date',d);if(propertyId)p.set('property',propertyId);setParams(p,{replace:true});};
 const scroll=useRef<number|null>(null);
 useEffect(()=>{if(!params.has('room')&&scroll.current!==null)window.scrollTo(0,scroll.current);},[params]);
 return <>{a&&<Link className="back-link" to={propertyPath(date,propertyId)}><ChevronLeft size={15}/>Back to property areas</Link>}<PageTitle eyebrow={a?'YOUR AREAS / '+a.name.toUpperCase():'FIND THEIR HOME AWAY FROM HOME'} title={a?a.name:'A room for every story.'} description={a?a.description:'Find a familiar name, explore the rooms, and make everyone feel at home.'} action={<div className="inventory-actions"><button className="button secondary" onClick={()=>{const p=new URLSearchParams(params);p.delete('room');p.delete('allocation');p.set('bulk','1');if(a){p.set('property',a.propertyId);p.set('area',a.id);}navigate({pathname:location.pathname,search:p.toString()},{state:{bulkOverlay:true},preventScrollReset:true});}}><Plus size={15}/>Allocate multiple rooms</button><button className="button secondary" onClick={onPdf}><FileDown size={15}/>Download PDF</button><button className="button secondary" onClick={onManageLabels}><Tag size={15}/>Labels</button>{onEditArea&&<button className="button secondary" onClick={onEditArea}><Pencil size={15}/>Edit area</button>}<button className="button primary" onClick={onAddRoom} disabled={!areas.some(ar=>!propertyId||ar.propertyId===propertyId)}><Plus size={16}/>Add room</button></div>}/>
 {a&&<div className="area-summary-strip"><span><BedDouble size={18}/><strong>{s.total}</strong> booked rooms</span>{statuses.map(status=><button key={status} onClick={()=>filter('status',status)}><i className={'dot '+statusClass(status)}/><strong>{areaRooms.filter(r=>(r.booked!==false||r.overdue)&&statusOf(r)===status).length}</strong> {status.toLowerCase()}</button>)}<span><Users size={17}/><strong>{s.arrived}/{s.assigned}</strong> arrived</span></div>}
 <section className="browser-toolbar"><div className="filter-search"><Search size={19}/><input aria-label={a?'Search rooms in '+a.name:'Search rooms, families or guests'} placeholder="Search room, family or guest…" value={q} onChange={e=>filter('q',e.target.value)}/>{q&&<button aria-label="Clear search" onClick={()=>filter('q','')}><X size={16}/></button>}</div><div className="selects"><label><Users size={16}/><select aria-label="Filter by linked guest group" value={params.get('guestGroup')||''} onChange={e=>filter('guestGroup',e.target.value)}><option value="">All guest groups</option>{guests.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{!a&&<label><MapPin size={16}/><select aria-label="Filter by property" value={propertyId} onChange={e=>{const p=new URLSearchParams(params);p.delete('area');p.delete('room');p.delete('allocation');e.target.value?p.set('property',e.target.value):p.delete('property');setParams(p,{replace:true,preventScrollReset:true});}}><option value="">All properties</option>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}<label><Tag size={16}/><select aria-label="Filter by allocation label" value={selectedLabel?.id||''} onChange={e=>filter('label',e.target.value)}><option value="">All labels</option>{labels.map(label=><option key={label.id} value={label.id}>{label.name}</option>)}</select><ChevronDown size={14}/></label>{!a&&<label><MapPin size={16}/><select aria-label="Filter by area" value={chosenArea} onChange={e=>filter('area',e.target.value)}><option value="">All areas</option>{areas.filter(ar=>!propertyId||ar.propertyId===propertyId).map(ar=><option key={ar.id} value={ar.id}>{ar.name}</option>)}</select><ChevronDown size={14}/></label>}<label><SlidersHorizontal size={16}/><select aria-label="Filter by room type" value={type} onChange={e=>filter('type',e.target.value)}><option value="">All room types</option><option>Normal</option><option>Suite</option></select><ChevronDown size={14}/></label></div></section>
 <div className="browser-subbar"><div className="status-tabs">{['',...statuses].map(status=><button className={st===status?'selected':''} key={status} onClick={()=>filter('status',status)}>{status&&<i className={'dot '+statusClass(status)}/>}<span>{status||'All rooms'}</span></button>)}</div><span className="result-count">{filtered.length} {filtered.length===1?'room':'rooms'}{(q||st||type||selectedLabel||params.get('guestGroup')||(!a&&chosenArea))&&<button onClick={resetFilters}>Reset filters<X size={13}/></button>}</span></div>
 {selectedLabel&&<div className="label-context"><span className="allocation-label"><Tag size={12}/>{selectedLabel.name}</span><p>{st==='Available'?'These rooms are unassigned. New allocations will start with this label.':'Showing allocations with this label.'}</p>{st!=='Available'&&<button onClick={()=>{const p=new URLSearchParams(params);p.set('status','Available');p.delete('q');p.delete('room');setParams(p,{replace:true});}}>Find available rooms for this label<ArrowRight size={14}/></button>}</div>}
 {filtered.length?<CompactRooms rooms={filtered} onOpen={openRoom}/>:<div className="empty"><Search size={30}/><h2>No rooms found</h2><p>{rooms.length?'Try a different name or give your filters a little more room.':'Create an area and add your rooms to get started.'}</p><button className="button secondary" onClick={resetFilters}>Clear search & filters</button></div>}
 </>;
}


function CompactRooms({rooms,onOpen}: {rooms:Room[];onOpen:(room:Room)=>void}) {
 const {labels}=useContext(LabelsContext);
 const areas=useContext(AreasContext);
 return <div className="compact-overview"><div className="compact-legend"><span>ROOM ALLOCATION AT A GLANCE</span><div>{statuses.map(status=><span key={status}><i className={'dot '+statusClass(status)}/>{status}</span>)}</div></div>{areas.map(area=>{
 const subset=rooms.filter(room=>room.areaId===area.id);if(!subset.length)return null;
 return <section key={area.id} className="compact-area" aria-label={area.name+' room grid'}><div className="compact-area-heading"><h2>{areaIcon(area.id)}{area.name}</h2><span>{subset.length} {subset.length===1?'room':'rooms'} · {subset.filter(room=>room.booked!==false&&statusOf(room)==='Available').length} available</span></div><div className="room-cell-grid">{subset.map(room=>{
 const status=statusOf(room);const notBooked=room.booked===false&&!room.overdue;const allocation=room.allocation;const label=labels.find(l=>l.id===allocation?.labelId);
 const occupants=allocation?.headcountPending?'Headcount pending':allocation?[...allocation.names, ...(allocation.unnamed?['+'+allocation.unnamed]:[])].join(', '):'No allocation';
 return <button key={room.id} className={'room-cell '+(notBooked?'not-booked':statusClass(status))} onClick={()=>onOpen(room)} aria-label={'Room '+room.number+', '+status+', '+(allocation?.group||occupants)+', '+countOf(allocation)+' of '+room.capacity+' guests, '+(allocation?.arrived||0)+' arrived'} title={room.number+' · '+(room.special||room.type)+'\n'+(allocation?.group||'Available')+'\n'+occupants}><div className="cell-top"><strong>{room.number}</strong><span>{room.special?<Sparkles size={12}/>:room.type==='Suite'?<BedDouble size={12}/>:null}{room.special||room.type}</span></div><span className="cell-status"><i/>{notBooked?'Not booked for this date':status}</span><div className="cell-group">{allocation?.group||(allocation?'Your guests':notBooked?'Choose other stay dates':'Ready to allocate')}</div>{label&&<span className="allocation-label cell-label" title={label.name}><Tag size={10}/>{label.name}</span>}<div className="cell-names">{allocation?occupants:'A warm welcome awaits'}</div><div className="cell-bottom"><span><Users size={12}/>{allocation?.headcountPending?'Pending':countOf(allocation)+'/'+room.capacity}</span><span>{allocation?allocation.arrived+' arrived':notBooked?'View stays':'Allocate +'} </span></div></button>;
 })}</div></section>;
 })}</div>;
}

function RoomHistory({room,data,onRecover}: {room:Room;data:Dataset;onRecover:(eventId:string)=>string|null}) {
 const [confirm,setConfirm]=useState<HistoryEntry|null>(null),[error,setError]=useState('');
 const events=data.history.filter(e=>e.roomId===room.id||e.destinationRoomId===room.id).slice().reverse();
 const recoveryLabel=(e:HistoryEntry)=>e.action==='checked-in'?'Undo check-in':e.action==='checked-out'?'Undo checkout':'Restore cancelled allocation';
 return <div className="room-history"><p className="inventory-hint">A record of this room’s stays and changes. Earlier stays are kept here after cancellation or checkout.</p>{!events.length&&<div className="history-empty"><History size={25}/><h3>A fresh start</h3><p>New allocation activity will appear here. Earlier activity was not recorded.</p></div>}{events.map(event=>{
 const before=event.before?.find(r=>r.id===room.id)||event.roomSnapshot,after=event.after?.find(r=>r.id===room.id);
 const allocation=after?.allocation||before?.allocation;
 const label=allocation?.labelId?event.labelNames?.[allocation.labelId]:undefined;
 const recoverable=['checked-in','checked-out','allocation-cancelled'].includes(event.action);
 const reason=recoverable?recoveryReason(data,event):null;
 return <article className="history-event" key={event.id}><span className="history-dot"/><div className="history-event-title"><h3>{historyTitles[event.action]||event.action.replaceAll('-',' ')}</h3><time dateTime={event.at}>{new Date(event.at).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div><p className="history-room-reference">Room {event.roomNames?.[room.id]||before?.number||room.number}{event.areaNames?.[(after||before||room).areaId]?' · '+event.areaNames[(after||before||room).areaId]:''}</p>{event.destinationRoomId&&<p className="history-move">{event.roomNames?.[event.roomId||'']||event.roomSnapshot?.number||'Previous room'} <ArrowRight size={12}/> {event.roomNames?.[event.destinationRoomId]||data.rooms.find(r=>r.id===event.destinationRoomId)?.number||'Destination room'}</p>}{allocation&&<><strong className="history-group">{allocation.group||'Your guests'}</strong>{label&&<span className="allocation-label"><Tag size={10}/>{label}</span>}<p className="history-guests">{[...allocation.names,...(allocation.unnamed?['+'+allocation.unnamed+' unnamed']:[])].join(', ')}</p><p className="history-count">{countOf(allocation)} assigned · {before?.allocation?.arrived??0} → {after?.allocation?.arrived??(event.action==='checked-out'?0:allocation.arrived)} arrived</p><details><summary>Allocation details</summary><div className="history-detail-grid"><span>Contact</span><span>{allocation.contact||'—'}</span><span>Notes</span><span>{allocation.notes||'—'}</span><span>Allocation ID</span><span>{allocation.id||'Older record'}</span><span>Created</span><span>{allocation.createdAt?new Date(allocation.createdAt).toLocaleString():'Not recorded'}</span></div></details>{event.action==='allocation-edited'&&before?.allocation&&after?.allocation&&<details><summary>Before this edit</summary><p className="history-guests">{before.allocation.group||'Your guests'} · {[...before.allocation.names,...(before.allocation.unnamed?['+'+before.allocation.unnamed]:[])].join(', ')}</p><p className="history-guests">Label: {event.labelNames?.[before.allocation.labelId||'']||'None'} · Contact: {before.allocation.contact||'—'}</p><p className="history-guests">{before.allocation.notes||'No notes'}</p></details>}</>}{recoverable&&<div className="history-recovery"><button className="button secondary" disabled={!!reason} onClick={()=>{setError('');setConfirm(event);}}><Undo2 size={13}/>{recoveryLabel(event)}</button>{reason&&<p>{reason}</p>}</div>}{event.action==='action-recovered'&&<p className="history-count">The original event remains in the record.</p>}</article>;
 })}{error&&<p className="field-error" role="alert">{error}</p>}{confirm&&<Confirm title={recoveryLabel(confirm)+'?'} text={`Restore the allocation state from before this action in room ${room.number}. Current capacity and room availability will be checked again.`} action="Restore previous state" onCancel={()=>setConfirm(null)} onConfirm={()=>{const message=onRecover(confirm.id);if(message)setError(message);setConfirm(null);}}/>}</div>;
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
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="pdf-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">A LITTLE CLARITY TO SHARE</p><h2 id="pdf-title">Allocation report</h2></div><button className="icon-button" onClick={onClose} aria-label="Close PDF export"><X size={20}/></button></div><div className="inventory-form pdf-dialog-body"><p className="inventory-hint">A downloadable PDF, grouped by property and area for the selected night. Full-stay availability is checked separately in bulk allocation.</p><fieldset className="pdf-scope" disabled={busy}><legend>Choose your rooms</legend>{([{value:'all',title:'All booked rooms',description:'All booked rooms and overdue occupancy exceptions for the selected night.'},{value:'current',title:'Current results',description:'Use current property, area, linked guest, search and room filters for booked rooms.'},{value:'available',title:'Available rooms',description:'Rooms available for the selected night across all properties.'}] as const).map(scope=><label key={scope.value} className={options.scope===scope.value?'selected':''}><input type="radio" name="report-scope" value={scope.value} checked={options.scope===scope.value} onChange={()=>{setOptions({...options,scope:scope.value});setError('');setNotice('');}}/><span><strong>{scope.title}</strong><small>{scope.description}</small></span></label>)}</fieldset><section className="pdf-selection"><strong>{selection.rooms.length} {selection.rooms.length===1?'room':'rooms'} to export</strong><p>{selection.totals.assigned} assigned guests · {selection.totals.arrived} arrived</p>{selection.descriptions.map((description,i)=><p className="pdf-filter-description" key={i}>{description}</p>)}{!selection.rooms.length&&<p className="field-error">No rooms match. Choose another scope or change your filters.</p>}</section><div className="pdf-optional"><p className="eyebrow">OPTIONAL DETAILS</p><label><input type="checkbox" disabled={busy} checked={options.includeContact} onChange={e=>setOptions({...options,includeContact:e.target.checked})}/><span>Include contact numbers</span></label><label><input type="checkbox" disabled={busy} checked={options.includeNotes} onChange={e=>setOptions({...options,includeNotes:e.target.checked})}/><span>Include allocation notes</span></label></div>{error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="data-notice" role="status">{notice}</p>}{busy&&<p className="inventory-hint" role="status">Preparing your report…</p>}</div><div className="inventory-dialog-footer"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" disabled={busy||!selection.rooms.length} onClick={()=>void download()}><FileDown size={15}/>{busy?'Generating…':'Download PDF'}</button></div></div></div>;
}

function MigrationSetup({legacy,onReady,onClose}: {legacy:LegacyDataset;onReady:(data:Dataset)=>boolean;onClose?:()=>void}) {
 const [settings,setSettings]=useState<MigrationSettings>({propertyName:'',bookedCheckIn:'',bookedCheckOut:'',checkIn:'',checkOut:'',defaultDate:''});
 const [error,setError]=useState('');
 const ref=useDialog(()=>onClose?.());
 function submit(e:React.FormEvent){e.preventDefault();try{const next=migrateLegacy(legacy,settings);validateData(next);if(!onReady(next))setError('The new data could not be saved. Existing data has been kept.');}catch(e){setError(e instanceof Error?e.message:'Migration could not be prepared.');}}
 const dateField=(key:keyof MigrationSettings,label:string)=><label key={key}>{label}<input required type="date" value={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value})}/></label>;
 return <div className="confirm-overlay"><div className="inventory-dialog migration-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="migration-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">ONE-TIME STAY SETUP</p><h2 id="migration-title">Keep your existing plans</h2></div>{onClose&&<button className="icon-button" aria-label="Cancel migration" onClick={onClose}><X size={20}/></button>}</div><form id="migration-form" className="allocation-form inventory-form" onSubmit={submit}><p className="inventory-hint">Your {legacy.rooms.length} rooms and {legacy.history.length} history entries will be preserved. Assign the existing inventory to a property and confirm its stay dates. These allocation dates apply to all currently assigned rooms; historical dates are left unchanged.</p><label>Property name<input required value={settings.propertyName} placeholder="Name of the existing property" onChange={e=>setSettings({...settings,propertyName:e.target.value})}/></label><div className="form-columns">{dateField('bookedCheckIn','Property booked from')}{dateField('bookedCheckOut','Property checkout date')}</div><div className="form-columns">{dateField('checkIn','Existing allocations: check-in')}{dateField('checkOut','Existing allocations: checkout')}</div>{dateField('defaultDate','Default working date')}<p className="inventory-hint">Checkout dates are exclusive. Choose a working date within the allocation stay. The original saved copy is left untouched.</p>{error&&<p className="field-error" role="alert">{error}</p>}</form><div className="inventory-dialog-footer">{onClose&&<button className="button secondary" onClick={onClose}>Cancel</button>}<button type="submit" form="migration-form" className="button primary">{onClose?'Prepare import':'Confirm & migrate'}</button></div></div></div>;
}

function DataDialog({data,onImport,onClose,onPdf}: {data:Dataset;onImport:(data:Dataset)=>boolean;onClose:()=>void;onPdf:()=>void}) {
 const [candidate,setCandidate]=useState<Dataset|null>(null),[filename,setFilename]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[confirm,setConfirm]=useState(false);
 const [legacy,setLegacy]=useState<LegacyDataset|null>(null);
 const request=useRef(0),input=useRef<HTMLInputElement>(null),ref=useDialog(onClose);
 useEffect(()=>()=>{request.current++;},[]);
 async function selectFile(file?:File){
  if(!file)return;const current=++request.current;setLoading(true);setError('');setNotice('');setCandidate(null);setLegacy(null);setFilename(file.name);
  try{const parsed=parseDataset(await file.text());if(current===request.current)setCandidate(parsed);}
  catch(e){if(current===request.current){if(e instanceof MigrationRequired)setLegacy(e.legacy);else setError(e instanceof Error?e.message:'The file could not be read.');}}
  finally{if(current===request.current)setLoading(false);if(input.current)input.current.value='';}
 }
 function download(){try{setError('');const blob=new Blob([serializeDataset(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=exportFilename();document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('JSON download requested. Save the file, then AirDrop it to your other device.');}catch(e){setError(e instanceof Error?e.message:'The data could not be exported.');}}
 const totals=candidate?summary(candidate.rooms):null;
 const preview=candidate?transferPreview(candidate):null;
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="data-title" tabIndex={-1}>
 <div className="inventory-dialog-header"><div><p className="eyebrow">TAKE YOUR PLANS WITH YOU</p><h2 id="data-title">Your data</h2></div><button className="icon-button" onClick={onClose} aria-label="Close data menu"><X size={20}/></button></div>
 <div className="inventory-form data-dialog-body">
 <section className="data-option"><span className="data-option-icon"><FileDown size={20}/></span><h3>Allocation PDF</h3><p>Download the current room view to share with family or venue helpers.</p><button className="button secondary" onClick={onPdf}><FileDown size={15}/>Download PDF</button></section>
 <section className="data-option"><span className="data-option-icon"><Download size={20}/></span><h3>Export JSON</h3><p>Download the complete wedding dataset, including guests, events, properties, dated allocations and history.</p><button className="button primary" onClick={download}><Download size={15}/>Export data</button></section>
 <section className="data-option"><span className="data-option-icon"><Upload size={20}/></span><h3>Import JSON</h3><p>Choose a WeddingStay version-3 or version-2 export. Older files require stay setup before you confirm replacement.</p><input ref={input} hidden type="file" accept=".json" aria-label="Select WeddingStay JSON file" onChange={e=>void selectFile(e.target.files?.[0])}/><button className="button secondary" disabled={loading} onClick={()=>input.current?.click()}><Upload size={15}/>{loading?'Reading file…':'Choose JSON file'}</button></section>
 <section className="data-option"><span className="data-option-icon"><Sparkles size={20}/></span><h3>Fictional reference data</h3><p>Explore six rooms, three guest groups and two events. Loading this replaces current data only after confirmation.</p><button className="button secondary" disabled={loading} onClick={()=>{setCandidate(seed());setFilename('Fictional reference data');setError('');setNotice('');}}>Load reference data</button></section>
 {candidate&&totals&&<section className="import-preview"><p className="eyebrow">READY TO IMPORT</p><h3>{filename}</h3>{preview&&<><p>{candidate.referenceData?'Fictional reference dataset':'Wedding dataset'} · Version {candidate.version}</p><p>{preview.active} active stays · {preview.completed} completed · {preview.cancelled} cancelled</p><p>{preview.from?'Booking coverage: '+preview.from+' → '+preview.until+' (checkout exclusive)':'No property booking dates'}</p><details className="requirement-nights"><summary>Property booking ranges</summary>{preview.properties.map((p,i)=><p key={i}>{p.name}: {p.ranges.map(r=>r.checkIn+' → '+r.checkOut).join('; ')||'No booked dates'}</p>)}</details></>}<div className="import-counts">{[[candidate.properties.length,'properties'],[candidate.areas.length,'areas'],[candidate.rooms.length,'rooms'],[candidate.allocations.length,'stays'],[candidate.guests.length,'guest groups'],[candidate.events.length,'events'],[candidate.invitations.length,'invitations'],[candidate.requirements.length,'room requirements'],[candidate.labels.length,'labels'],[candidate.history.length,'history entries']].map(([n,label])=><span key={label}><strong>{n}</strong> {label}</span>)}</div><p>Working date: {candidate.wedding.defaultDate} · {totals.assigned} known assigned guests · {totals.pending} headcounts pending</p><p className="inventory-hint">Import replaces this device’s current data; it does not merge or synchronize devices. Export current data first if you wish to retain a separate copy.</p><button className="button primary full" onClick={()=>setConfirm(true)}>Import & replace current data</button></section>}
 {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="data-notice" role="status">{notice}</p>}</div>
 <div className="inventory-dialog-footer"><button className="button secondary" onClick={onClose}>Done</button></div></div>
 {legacy&&<MigrationSetup legacy={legacy} onClose={()=>setLegacy(null)} onReady={next=>{setCandidate(next);setLegacy(null);return true;}}/>}
 {confirm&&candidate&&<Confirm title="Replace this device’s data?" text={`Load ${candidate.rooms.length} rooms, ${candidate.allocations.length} stays and ${candidate.guests.length} guest groups from ${filename}? Current data will be replaced completely.`} action="Replace & import" onCancel={()=>setConfirm(false)} onConfirm={()=>{if(!onImport(candidate)){setError('The import could not be saved. Your current data has been kept.');setConfirm(false);}}}/>}
 </div>;
}

function LabelsManager({rooms,onClose}: {rooms:Room[];onClose:()=>void}) {
 const {labels,saveLabel,deleteLabel}=useContext(LabelsContext);
 const [name,setName]=useState(''),[editingId,setEditingId]=useState<string|undefined>(),[error,setError]=useState('');
 const [deleting,setDeleting]=useState<AllocationLabel|null>(null);
 const ref=useDialog(onClose);
 const reset=()=>{setName('');setEditingId(undefined);setError('');};
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="labels-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">KEEP YOUR PEOPLE TOGETHER</p><h2 id="labels-title">Allocation labels</h2></div><button className="icon-button" aria-label="Close labels" onClick={onClose}><X size={20}/></button></div><div className="inventory-form labels-body"><p className="inventory-hint">One label can connect several room allocations. Family and guest details stay separate.</p><form className="allocation-form label-manager-form" onSubmit={e=>{e.preventDefault();const result=saveLabel(name,editingId);if(result.error)setError(result.error);else reset();}}><label>{editingId?'Rename label':'Create a label'}<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Groom’s relatives"/></label><div className="label-manager-actions">{editingId&&<button type="button" className="button secondary" onClick={reset}>Cancel rename</button>}<button className="button primary" type="submit">{editingId?'Save name':'Create label'}</button></div></form>{error&&<p className="field-error" role="alert">{error}</p>}<div className="label-list">{labels.length?labels.map(label=><div className="label-list-row" key={label.id}><div><span className="allocation-label"><Tag size={12}/>{label.name}</span><small>{rooms.filter(r=>r.allocation?.labelId===label.id).length} allocations</small></div><button className="icon-button" aria-label={'Rename '+label.name} onClick={()=>{setEditingId(label.id);setName(label.name);setError('');}}><Pencil size={15}/></button><button className="icon-button danger" aria-label={'Delete '+label.name} onClick={()=>setDeleting(label)}><Trash2 size={15}/></button></div>):<p className="inventory-hint">No labels yet. Create your first one above or while allocating a room.</p>}</div></div><div className="inventory-dialog-footer"><button className="button secondary" onClick={onClose}>Done</button></div></div>
 {deleting&&<Confirm title={'Remove “'+deleting.name+'”?'} text={`This removes the label from ${rooms.filter(r=>r.allocation?.labelId===deleting.id).length} allocations. All rooms, guests and allocations will be kept.`} action="Remove label" onCancel={()=>setDeleting(null)} onConfirm={()=>{const message=deleteLabel(deleting.id);if(message)setError(message);else if(editingId===deleting.id)reset();setDeleting(null);}}/>}
 </div>;
}

function InventoryEditor({target,rooms,properties,onSave,onDelete,onClose}: {target:InventoryTarget;rooms:Room[];properties:Dataset['properties'];onSave:(value:Area|Room)=>string|null;onDelete:(value:Area|Room)=>string|null;onClose:()=>void}) {
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
 function submit(e:React.FormEvent){e.preventDefault();const cleaned=room?{...room,number:room.number.trim(),notes:room.notes?.trim()}:area?{...area,name:area.name.trim(),description:area.description.trim()}:draft;const message=onSave(cleaned);if(message)setError(message);else onClose();}
 return <div className="inventory-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><div className="inventory-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="inventory-title" tabIndex={-1}><div className="inventory-dialog-header"><div><p className="eyebrow">YOUR WEDDING SPACE</p><h2 id="inventory-title">{existing?'Edit':'Add'} {isRoom?'room':'area'}</h2></div><button className="icon-button" onClick={close} aria-label="Close inventory editor"><X size={20}/></button></div><form className="allocation-form inventory-form" id="inventory-form" onSubmit={submit}>
 {area&&<><label>Property<select required value={area.propertyId} onChange={e=>setDraft({...area,propertyId:e.target.value})}>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Area name<input autoFocus required value={area.name} placeholder="e.g. Garden Wing" onChange={e=>setDraft({...area,name:e.target.value})}/></label><label>Description <span>optional</span><textarea rows={2} value={area.description} placeholder="A little about this part of the venue" onChange={e=>setDraft({...area,description:e.target.value})}/></label></>}
 {room&&<><label>Room number<input autoFocus required value={room.number} placeholder="e.g. 141 or A-01" onChange={e=>setDraft({...room,number:e.target.value})}/></label><label>Area<select value={room.areaId} required onChange={e=>setDraft({...room,areaId:e.target.value})}><option value="" disabled>Choose an area</option>{areas.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><div className="form-columns"><label>Room type<select value={room.type} onChange={e=>setDraft({...room,type:e.target.value as Room['type'],special:e.target.value==='Normal'?undefined:room.special})}><option>Normal</option><option>Suite</option></select></label><label>Maximum occupancy<input required type="number" min={1} step={1} value={room.capacity||''} onChange={e=>setDraft({...room,capacity:Number(e.target.value)})}/></label></div>{room.allocation&&<p className="inventory-hint">{countOf(room.allocation)} guests are assigned. Capacity must accommodate everyone.</p>}{room.type==='Suite'&&<label>Special designation<select value={room.special||''} onChange={e=>setDraft({...room,special:e.target.value||undefined})}><option value="">None</option><option>Bride Suite</option><option>Groom Suite</option></select></label>}<label>Room notes <span>optional</span><textarea rows={3} value={room.notes||''} placeholder="Floor, accessibility or other useful details" onChange={e=>setDraft({...room,notes:e.target.value})}/></label></>}
 {error&&<p role="alert" className="field-error">{error}</p>}
 {existing&&<div className="inventory-delete"><button type="button" disabled={blocked} onClick={()=>setConfirmation('delete')} className="quiet-button danger"><Trash2 size={14}/>Delete {isRoom?'room':'area'}</button>{blocked&&<p>{isRoom?'End the active allocation before deleting this room.':'Move or remove all rooms before deleting this area.'}</p>}</div>}
 </form><div className="inventory-dialog-footer"><button className="button secondary" onClick={close}>Cancel</button><button className="button primary" type="submit" form="inventory-form"><Check size={16}/>Save {isRoom?'room':'area'}</button></div></div>
 {confirmation&&<Confirm title={confirmation==='discard'?'Discard unsaved changes?':`Delete ${room?'room '+room.number:area?.name}?`} text={confirmation==='discard'?'These details have not been saved.':'This removes it from your current inventory. This action cannot be undone.'} action={confirmation==='discard'?'Discard changes':'Delete'} onCancel={()=>setConfirmation(null)} onConfirm={()=>{if(confirmation==='discard')onClose();else{const message=onDelete(draft);if(message){setError(message);setConfirmation(null);}else onClose();}}}/>}
 </div>;
}



const router=(import.meta.env.MODE==='pages'?createHashRouter:createBrowserRouter)([{path:'*',element:<App/>}]);
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
