import {useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Settings,Users,Database,Download,CalendarDays,LockKeyhole} from 'lucide-react';
import {useCloud} from './CloudAccess';
import {useNavigate} from './navigation';
import {WeddingMembers} from './WeddingMembers';
import {OfflineModeControls} from './OfflineControls';
import {CategoryImport} from './CategoryImport';
import {CloudReplacement} from './CloudReplacement';
import {syncLabels} from './cloudSync';

export function WeddingSettings({onBusyChange,busy,modeBlocked}:{onBusyChange:(busy:boolean)=>void;busy:boolean;modeBlocked:boolean}){
 const cloud=useCloud(),location=useLocation(),navigate=useNavigate();
 const section=new URLSearchParams(location.search).get('section')||(cloud.role==='owner'?'members':'data');
 const owner=cloud.role==='owner',verified=cloud.permissionVerified&&cloud.online;
 return <div className="wedding-settings-page"><div className="page-heading"><div><p className="eyebrow">YOUR WEDDING SPACE</p><h1>Wedding settings</h1><p className="page-description">People, data, and the way you work.</p></div><Settings className="settings-heading-icon" size={28}/></div><section className="settings-wedding-context"><span className="settings-wedding-symbol">♡</span><div><strong>{cloud.snapshot.data.wedding.name}</strong><span><CalendarDays size={14}/>{new Date(cloud.snapshot.data.wedding.defaultDate+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</span></div></section>
 <nav className="settings-section-nav" aria-label="Wedding settings sections">{owner&&<button className={section==='members'?'active':''} aria-current={section==='members'?'page':undefined} disabled={busy} onClick={()=>navigate('/settings?section=members')}><Users size={17}/>Members</button>}<button className={section==='data'?'active':''} aria-current={section==='data'?'page':undefined} disabled={busy} onClick={()=>navigate('/settings?section=data')}><Database size={17}/>Data & offline</button></nav>
 {section==='members'?(owner&&verified?<WeddingMembers scope={cloud.scope} weddingName={cloud.snapshot.data.wedding.name} onBusyChange={onBusyChange}/>:<section className="settings-panel settings-restricted"><LockKeyhole size={24}/><h2>{owner?'Connect to manage members':'Only app owners can manage members'}</h2><p>{owner?'Member access is available after an online access check. Your local work is kept.':'You can continue managing this wedding’s guests, events, and stays.'}</p><button className="button secondary" disabled={busy} onClick={()=>owner?cloud.retryConnection():navigate('/settings?section=data')}>{owner?'Check connection':'Open data & offline'}</button></section>):section==='data'?<DataSettings onBusyChange={onBusyChange} modeBlocked={modeBlocked}/>:<section className="settings-panel"><h2>Section not found</h2><button className="button secondary" onClick={()=>navigate('/settings?section=data')}>Open data & offline</button></section>}
 </div>;
}
function DataSettings({onBusyChange,modeBlocked}:{onBusyChange:(busy:boolean)=>void;modeBlocked:boolean}){
 const cloud=useCloud(),[replacing,setReplacing]=useState(false);
 const activity=(value:boolean)=>{setReplacing(value);onBusyChange(value);};
 const owner=cloud.role==='owner'&&cloud.permissionVerified;
 return <section className="settings-panel data-settings"><div className="settings-section-heading"><div><h2><Database size={20}/>Data & offline</h2><p>{syncLabels[cloud.status]} · Last synced: {cloud.lastSyncedAt?new Date(cloud.lastSyncedAt).toLocaleString():'Not recorded'}</p></div></div>
 <section className="data-option"><h3>{cloud.workMode==='offline'?'Offline workspace':'Work offline'}</h3><OfflineModeControls disabled={replacing||modeBlocked}/></section>
 <section className="data-option"><h3>Download a backup</h3><p>{cloud.workMode==='offline'?'Save your complete local working copy, including unsynced changes.':'Save the latest complete wedding snapshot as a JSON file.'}</p><button className="button secondary" disabled={replacing||cloud.offline.busy} onClick={cloud.exportCopy}><Download size={16}/>Export data</button></section>
 {owner&&<><CategoryImport disabled={replacing||cloud.offline.busy} onBusyChange={activity}/><CloudReplacement disabled={replacing||cloud.offline.busy||cloud.workMode==='offline'} onBusyChange={activity}/></>}
 <details className="settings-advanced"><summary>Advanced · Sync details</summary><p>Activity observed in this browser session. These counters do not include security-rule or metadata reads and are not Firebase’s billed total.</p><dl className="sync-diagnostics"><div><dt>Complete loads</dt><dd>{cloud.diagnostics.fullLoads}</dd></div><div><dt>Incremental loads</dt><dd>{cloud.diagnostics.incrementalLoads}</dd></div><div><dt>Documents returned</dt><dd>{cloud.diagnostics.returnedDocuments}</dd></div><div><dt>Cache restores</dt><dd>{cloud.diagnostics.cacheRestores}</dd></div></dl><p>Revision {cloud.snapshot.revision}</p>{cloud.cacheWarning&&<p className="field-error">{cloud.cacheWarning}</p>}<button className="button secondary" disabled={replacing||cloud.offline.busy||cloud.workMode==='offline'||cloud.status==='checking'||cloud.status==='syncing'} onClick={cloud.retryConnection}>Retry connection</button></details>
 </section>;
}
