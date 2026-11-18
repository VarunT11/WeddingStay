import {useMemo,useRef,useState} from 'react';
import {Upload} from 'lucide-react';
import {useCloud} from './CloudAccess';
import {type CloudSnapshot} from './cloudStore';
import {cloudError} from './firebase';
import {Confirm} from './dialogs';
import {applyCategoryImport,categoryImportPreview,parseCategoryImport,type CategoryImportFile} from './categoryAssignments';

export function CategoryImport({onBusyChange,disabled=false}:{onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const cloud=useCloud(),input=useRef<HTMLInputElement>(null),running=useRef(false);
 const [file,setFile]=useState<CategoryImportFile|null>(null),[baseline,setBaseline]=useState<CloudSnapshot|null>(null),[filename,setFilename]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
 const preview=useMemo(()=>file&&baseline?categoryImportPreview(baseline.data,file):null,[file,baseline]);
 const stale=!!baseline&&(baseline.revision!==cloud.snapshot.revision||baseline.datasetVersion!==cloud.snapshot.datasetVersion);
 if(cloud.role!=='owner')return null;
 async function choose(chosen:File){setReading(true);setError('');setNotice('');setFile(null);setBaseline(null);try{const parsed=parseCategoryImport(await chosen.text());setFile(parsed);setBaseline(cloud.snapshot);setFilename(chosen.name);}catch(cause){setError(cloudError(cause));}finally{setReading(false);}}
 async function apply(){
  setConfirm(false);
  if(disabled||running.current||!baseline||!preview||stale||!cloud.canEdit||!preview.changes.length||(cloud.workMode!=='offline'&&preview.totalWrites>440))return;
  running.current=true;setBusy(true);onBusyChange(true);setConfirm(false);setError('');
  try{await cloud.commit(baseline,applyCategoryImport(baseline.data,preview,cloud.workMode==='offline'));setNotice(preview.changes.length+(cloud.workMode==='offline'?' guest categories saved on this device.':' guest categories updated.')+' Other guest and wedding details were preserved.');setBaseline(null);setFile(null);}
  catch(cause){setError(cloudError(cause));}
  finally{running.current=false;setBusy(false);onBusyChange(false);}
 }
 return <section className="data-option"><h3>Apply categories from JSON</h3><p>Organise categories in a WeddingStay export offline, then apply only category assignments to the latest guest list. Blank categories keep current assignments. Guests are matched by ID.</p><input ref={input} hidden type="file" accept=".json,application/json" disabled={disabled||busy||reading} onChange={event=>{const chosen=event.target.files?.[0];event.target.value='';if(chosen)void choose(chosen);}}/><button className="button secondary" disabled={disabled||busy||reading} onClick={()=>input.current?.click()}><Upload size={15}/>{reading?'Reading file…':'Choose category JSON'}</button>
 {preview&&baseline&&<div className="category-import-preview"><strong>{filename}</strong><p>Compared with saved revision {baseline.revision}. Explicit category text in the file takes priority over its category IDs. Existing category names are reused; categories are not renamed or removed.</p><p>{preview.changes.length} guest changes · {preview.added.length} new categories · {preview.unchanged} unchanged · {preview.blanks} blank entries skipped · {preview.unmatched.length} unmatched IDs</p>{preview.changes.length>0&&<div className="replacement-table-wrap"><table className="replacement-table"><caption>Category assignment changes</caption><thead><tr><th>Guest group</th><th>Current</th><th>From file</th></tr></thead><tbody>{preview.changes.map(change=><tr key={change.guestId}><th scope="row">{change.name}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>}{preview.added.length>0&&<p>New categories: {preview.added.map(category=>category.name).join(', ')}</p>}{preview.unmatched.length>0&&<details><summary>Unmatched guest IDs — skipped</summary><ul>{preview.unmatched.map(id=><li key={id}>{id}</li>)}</ul></details>}{!cloud.canEdit&&<p className="category-import-notice">This preview uses the saved copy. Reconnect and review the latest comparison before applying.</p>}{stale&&<p className="field-error" role="alert">Saved data changed after this comparison. Review the latest comparison before applying.</p>}{(cloud.workMode!=='offline'&&preview.totalWrites>440)&&<p className="field-error" role="alert">More than 440 records would change. Use a smaller file; nothing has been applied.</p>}{!preview.changes.length&&<p>No category changes to apply.</p>}<div className="category-import-actions"><button className="button secondary" disabled={disabled||busy||!cloud.canEdit} onClick={()=>{setBaseline(cloud.snapshot);setError('');}}>Review latest comparison</button><button className="button primary" disabled={disabled||busy||stale||!cloud.canEdit||!preview.changes.length||(cloud.workMode!=='offline'&&preview.totalWrites>440)} onClick={()=>setConfirm(true)}>Apply category changes</button></div></div>}
 {notice&&<p className="data-notice" role="status">{notice}</p>}{error&&<p className="field-error" role="alert">{error}</p>}{confirm&&preview&&<Confirm title="Apply these category changes?" text={`Update categories for ${preview.changes.length} existing guest groups and add ${preview.added.length} categories. Current RSVPs, counts, contacts, room links and history will be kept. In offline mode this saves locally until you sync.`} action="Apply categories" onCancel={()=>setConfirm(false)} onConfirm={()=>void apply()}/>}
 </section>;
}
