import {useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {useCloud} from './CloudAccess';
import {replacementPreview,replaceWedding,type CloudSnapshot} from './cloudStore';
import {cloudError} from './firebase';
import {parseDataset,serializeDataset,exportFilename} from './transfer';
import {storedData,type Dataset} from './data';
import {Confirm} from './dialogs';

export function CloudReplacement({onBusyChange}:{onBusyChange:(busy:boolean)=>void}){
 const cloud=useCloud(),file=useRef<HTMLInputElement>(null),running=useRef(false);
 const [candidate,setCandidate]=useState<Dataset|null>(null),[baseline,setBaseline]=useState<CloudSnapshot|null>(null),[filename,setFilename]=useState('');
 const [error,setError]=useState(''),[progress,setProgress]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[downloaded,setDownloaded]=useState(false),[backedUp,setBackedUp]=useState(false),[confirm,setConfirm]=useState(false);
 if(cloud.role!=='owner')return null;
 const stale=!!baseline&&(baseline.revision!==cloud.snapshot.revision||baseline.datasetVersion!==cloud.snapshot.datasetVersion);
 const rows=candidate&&baseline?replacementPreview(baseline.data,candidate):[];
 const settingsChanged=!!candidate&&!!baseline&&JSON.stringify(storedData(candidate).wedding)!==JSON.stringify(storedData(baseline.data).wedding);
 async function select(chosen:File){
  setReading(true);setError('');setCandidate(null);setBaseline(null);setDownloaded(false);setBackedUp(false);setProgress('');
  try{const next=parseDataset(await chosen.text());setCandidate(next);setBaseline(cloud.snapshot);setFilename(chosen.name);}catch(cause){setError(cloudError(cause));}finally{setReading(false);}
 }
 function backup(){
  if(!baseline||stale)return;
  try{const url=URL.createObjectURL(new Blob([serializeDataset(baseline.data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='before-replacement-'+exportFilename();link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloaded(true);setError('');}catch(cause){setError(cloudError(cause));}
 }
 async function replace(){
  if(running.current)return;
  if(!baseline||!candidate||!backedUp||!downloaded||stale||!cloud.online){setConfirm(false);setError('Reconnect and review the latest comparison and backup before replacing data.');return;}
  running.current=true;setConfirm(false);setBusy(true);onBusyChange(true);setError('');setProgress('Preparing a separate upload. Current data stays active…');
  try{await replaceWedding(baseline,candidate,setProgress);setProgress('Replacement activated. Loading your new dataset…');}
  catch(cause){setError(cloudError(cause));setProgress('The active cloud dataset was not replaced. You can retry or choose another file.');}
  finally{running.current=false;setBusy(false);onBusyChange(false);}
 }
 return <section className="data-option cloud-replacement">
  <h3>Replace cloud data</h3>
  <p>Upload your edited WeddingStay JSON to replace all wedding records, including guests, events, rooms, allocations and history. Records missing from the file leave the active dataset. Account access stays unchanged.</p>
  <input ref={file} className="file-input" type="file" accept=".json,application/json" aria-label="Choose replacement WeddingStay JSON" disabled={busy||reading||!cloud.online} onChange={e=>{const chosen=e.target.files?.[0];e.target.value='';if(chosen)void select(chosen);}}/>
  <button className="button secondary" disabled={busy||reading||!cloud.online} onClick={()=>file.current?.click()}><Upload size={15}/>{reading?'Reading file…':'Choose replacement JSON'}</button>
  {!cloud.online&&<p>Connect to the cloud to review or replace data.</p>}
  {candidate&&baseline&&<div className="replacement-preview">
   <strong>{filename}</strong><p>Compared with cloud revision {baseline.revision}. Wedding settings {settingsChanged?'will change':'are unchanged'}.</p>
   <div className="replacement-table-wrap"><table className="replacement-table"><caption>Full dataset comparison</caption><thead><tr><th>Records</th><th>Now</th><th>File</th><th>Added</th><th>Changed</th><th>Removed</th></tr></thead><tbody>{rows.map(row=><tr key={row.kind}><th scope="row">{row.kind}</th><td>{row.current}</td><td>{row.next}</td><td>{row.added}</td><td>{row.changed}</td><td className={row.removed?'replacement-removals':''}>{row.removed}</td></tr>)}</tbody></table></div>
   <p className="replacement-warning">This is a full replacement, including wedding settings and history. It does not merge the file with current records.</p>
   {stale?<><p className="field-error" role="alert">Cloud data changed after this preview. Review the latest comparison and download a new backup.</p><button className="button secondary" disabled={busy||!cloud.online} onClick={()=>{setBaseline(cloud.snapshot);setDownloaded(false);setBackedUp(false);setError('');setProgress('');}}>Review latest comparison</button></>:<>
    <button className="button secondary" disabled={busy||!cloud.online} onClick={backup}><Download size={15}/>Download current cloud JSON</button>
    {downloaded&&<label className="replacement-backup"><input type="checkbox" checked={backedUp} disabled={busy} onChange={e=>setBackedUp(e.target.checked)}/><span>I have saved the current cloud JSON for recovery.</span></label>}
    <button className="button primary" disabled={busy||!cloud.online||!downloaded||!backedUp} onClick={()=>setConfirm(true)}>{busy?'Uploading replacement…':'Replace cloud data'}</button>
   </>}
  </div>}
  {progress&&<p className="data-notice" role="status" aria-live="polite">{progress}</p>}
  {error&&<p className="field-error" role="alert">{error}</p>}
  {confirm&&<Confirm title="Replace the entire shared wedding?" text={`Use ${filename} as the complete dataset for every coordinator. Records missing from this file will no longer be active. Your downloaded JSON and the previous cloud version remain available for recovery.`} action="Replace shared data" onCancel={()=>setConfirm(false)} onConfirm={()=>void replace()}/>}
 </section>;
}
