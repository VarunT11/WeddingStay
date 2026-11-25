// Focused domain checks only. Does not connect to Firebase or load real wedding data.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const directory=await mkdtemp(join(tmpdir(),'weddingstay-task-checks-'));
try{
 const file=join(directory,'model.mjs');await build({entryPoints:['src/taskModel.ts'],bundle:true,platform:'node',format:'esm',outfile:file,logLevel:'silent'});
 const {emptyTasks,validateTasks,validateTaskChanges,mergeTaskData,planTaskBatches,overdueTask,taskChanges,updateTaskChecklist,recordTaskUpdate}=await import(pathToFileURL(file).href);
 const at='2026-11-25T12:00:00.000Z',category={id:'category',name:'Transport',order:0,archived:false};
 const task={id:'task',title:'Confirm pickup',categoryId:'category',notes:'',assignee:'person',helpers:['helper'],priority:'Normal',dueDate:'2000-01-01',dueAt:'',status:'To do',blockedReason:'',checklist:[{id:'step',title:'Call driver'}],checklistIds:['step'],checkedSteps:[],link:null,archived:false,createdAt:at,createdBy:'manager',updatedAt:at,updatedBy:'manager',completedAt:'',completedBy:''};
 const base={version:1,categories:[category],tasks:[task],activity:[]},people=[{id:'person',name:'Person',role:'participant',active:true},{id:'helper',name:'Helper',role:'participant',active:true}];
 let count=0;function check(name,fn){fn();count++;console.log('PASS:',name);}
 check('Empty and populated task plans validate',()=>{validateTasks(emptyTasks());validateTasks(base);});
 check('Participant can complete assigned checklist steps',()=>validateTaskChanges(base,{...base,tasks:[{...task,checkedSteps:['step'],updatedBy:'person'}]},'participant','person',people));
 check('Inline final step preserves task status and planning fields',()=>{const next=updateTaskChecklist(task,'step',true,'person',at);assert.equal(next.status,'To do');assert.deepEqual(next.checkedSteps,['step']);assert.equal(next.completedAt,'');assert.equal(next.updatedBy,'person');assert.deepEqual(next.checklist,task.checklist);assert.deepEqual(task.checkedSteps,[]);validateTaskChanges(base,{...base,tasks:[next]},'participant','person',people);});
 check('Inline checklist writes descriptive attributed activity',()=>{const result=recordTaskUpdate(base,updateTaskChecklist(task,'step',true,'person',at),'person','Person');assert.equal(result.activity.length,1);assert.equal(result.activity[0].action,'Completed checklist step: Call driver');assert.equal(result.activity[0].actor,'person');assert.equal(result.activity[0].taskId,task.id);validateTasks(result);});
 check('Unchecking a completed step records its title',()=>{const before={...base,tasks:[{...task,checkedSteps:['step']}]};const result=recordTaskUpdate(before,updateTaskChecklist(before.tasks[0],'step',false,'person',at),'person','Person');assert.deepEqual(result.tasks[0].checkedSteps,[]);assert.equal(result.activity[0].action,'Reopened checklist step: Call driver');});
 check('Completed task stays Done when a checklist step is unchecked',()=>{const done={...task,status:'Done',checkedSteps:['step'],completedAt:at,completedBy:'person'},next=updateTaskChecklist(done,'step',false,'person',at);assert.equal(next.status,'Done');assert.equal(next.completedAt,at);assert.equal(next.completedBy,'person');validateTaskChanges({...base,tasks:[done]},{...base,tasks:[next]},'participant','person',people);});
 check('Task may be explicitly completed with unchecked steps',()=>{const next={...task,status:'Done',completedAt:at,completedBy:'person',updatedBy:'person'};validateTaskChanges(base,{...base,tasks:[next]},'participant','person',people);assert.deepEqual(next.checkedSteps,[]);});
 check('Inline update rejects a removed step and avoids duplicate progress',()=>{assert.throws(()=>updateTaskChecklist(task,'removed',true,'person',at));const checked=updateTaskChecklist(task,'step',true,'person',at);assert.deepEqual(updateTaskChecklist(checked,'step',true,'person',at).checkedSteps,['step']);assert.equal(recordTaskUpdate({...base,tasks:[checked]},checked,'person','Person').activity.length,0);});
 check('Checklist updates respect assignment and archive restrictions',()=>{const next=updateTaskChecklist(task,'step',true,'other',at);assert.throws(()=>validateTaskChanges(base,{...base,tasks:[next]},'participant','other',people));const archived={...task,archived:true};assert.throws(()=>validateTaskChanges({...base,tasks:[archived]},{...base,tasks:[updateTaskChecklist(archived,'step',true,'person',at)]},'participant','person',people));});
 check('Helper can update progress',()=>validateTaskChanges(base,{...base,tasks:[{...task,status:'In progress',updatedBy:'helper'}]},'participant','helper',people));
 check('Unassigned participant cannot update progress',()=>assert.throws(()=>validateTaskChanges(base,{...base,tasks:[{...task,status:'In progress'}]},'participant','other',people)));
 check('Participant cannot change task planning fields',()=>assert.throws(()=>validateTaskChanges(base,{...base,tasks:[{...task,title:'Changed'}]},'participant','person',people)));
 check('Participant cannot change checklist titles',()=>assert.throws(()=>validateTaskChanges(base,{...base,tasks:[{...task,checklist:[{id:'step',title:'Changed'}]}]},'participant','person',people)));
 check('Participant cannot manage categories',()=>assert.throws(()=>validateTaskChanges(base,{...base,categories:[{...category,name:'Changed'}]},'participant','person',people)));
 check('No-access member cannot save',()=>assert.throws(()=>validateTaskChanges(base,base,'none','person',people)));
 check('Blocked task requires a reason',()=>assert.throws(()=>validateTasks({...base,tasks:[{...task,status:'Blocked'}]})));
 check('Task must reference an existing category',()=>assert.throws(()=>validateTasks({...base,categories:[]})));
 check('Category names must be unique',()=>assert.throws(()=>validateTasks({...base,categories:[category,{...category,id:'other',name:' TRANSPORT '}]})));
 check('Checklist completion cannot reference unknown steps',()=>assert.throws(()=>validateTasks({...base,tasks:[{...task,checkedSteps:['unknown']}]})));
 check('New assignments must have active task access',()=>assert.throws(()=>validateTaskChanges(base,{...base,tasks:[{...task,assignee:'inactive'}]},'manager','manager',people)));
 check('Historical inactive assignments may remain',()=>validateTaskChanges(base,{...base,tasks:[{...task,notes:'Updated'}]},'manager','manager',[]));
 check('Task deletion is rejected',()=>assert.throws(()=>validateTaskChanges(base,{...base,tasks:[]},'manager','manager',people)));
 check('Existing activity is immutable',()=>{const before={...base,activity:[{id:'a',taskId:'task',action:'Created',actor:'manager',actorName:'Manager',at}]};assert.throws(()=>validateTaskChanges(before,{...before,activity:[]},'owner','owner',people));});
 check('Different records merge without conflict',()=>{const local={...base,categories:[{...category,name:'Travel'}]},remote={...base,tasks:[{...task,status:'In progress'}]};const merged=mergeTaskData(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.data.categories[0].name,'Travel');assert.equal(merged.data.tasks[0].status,'In progress');});
 check('Same-record changes require explicit conflict resolution',()=>{const local={...base,tasks:[{...task,title:'Local'}]},remote={...base,tasks:[{...task,title:'Cloud'}]};assert.equal(mergeTaskData(base,local,remote).conflicts.length,1);assert.equal(mergeTaskData(base,local,remote,{'tasks:task':'mine'}).data.tasks[0].title,'Local');});
 check('Acknowledged upload is not reported as a conflict',()=>{const next={...base,tasks:[{...task,title:'Uploaded'}]};assert.equal(mergeTaskData(base,next,next).conflicts.length,0);});
 check('Large offline plans split into bounded valid saves',()=>{const target={...base,tasks:Array.from({length:850},(_,index)=>({...task,id:'task-'+index}))};const batches=planTaskBatches(emptyTasks(),target);assert.ok(batches.length>=3);let previous=emptyTasks();for(const batch of batches){validateTasks(batch);assert.ok(taskChanges(previous,batch).length<=440);previous=batch;}assert.equal(previous.tasks.length,850);});
 check('Completed and archived tasks are not overdue',()=>{assert.ok(overdueTask(task));assert.equal(overdueTask({...task,status:'Done'}),false);assert.equal(overdueTask({...task,archived:true}),false);});
 console.log(`${count} task domain checks passed.`);
}finally{await rm(directory,{recursive:true,force:true});}
