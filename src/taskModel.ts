import {isDate,localToday} from './model';

export type TaskRole='none'|'participant'|'manager'|'owner';
export type TaskPerson={id:string;name:string;active:boolean;role:TaskRole};
export type TaskCategory={id:string;name:string;order:number;archived:boolean};
export type TaskStatus='To do'|'In progress'|'Blocked'|'Done';
export type TaskLink={kind:'event'|'property'|'guest';id:string;name:string};
export type WeddingTask={id:string;title:string;categoryId:string;notes:string;assignee:string;helpers:string[];priority:'Low'|'Normal'|'High';dueDate:string;dueAt:string;status:TaskStatus;blockedReason:string;checklist:{id:string;title:string}[];checklistIds:string[];checkedSteps:string[];link:TaskLink|null;archived:boolean;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;completedAt:string;completedBy:string};
export type TaskActivity={id:string;taskId:string;action:string;actor:string;actorName:string;at:string};
export type TaskData={version:1;categories:TaskCategory[];tasks:WeddingTask[];activity:TaskActivity[]};
export type TaskSnapshot={revision:number;data:TaskData};
export const emptyTasks=():TaskData=>({version:1,categories:[],tasks:[],activity:[]});
export const taskKinds=['categories','tasks','activity'] as const;
export const taskStatuses:TaskStatus[]=['To do','In progress','Blocked','Done'];
export const taskManager=(role:TaskRole)=>role==='owner'||role==='manager';
export const assignedTo=(task:WeddingTask,uid:string)=>task.assignee===uid||task.helpers.includes(uid);
export const sameTaskValue=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function overdueTask(task:WeddingTask,now=new Date()){
 return !task.archived&&task.status!=='Done'&&!!task.dueDate&&(task.dueAt?Date.parse(task.dueAt)<now.getTime():task.dueDate<localToday());
}
export function validateTasks(value:TaskData):void {
 if(!value||value.version!==1||taskKinds.some(kind=>!Array.isArray(value[kind])))throw new Error('Choose a valid WeddingStay task backup.');
 for(const kind of taskKinds){const ids=new Set<string>();for(const row of value[kind]){if(!row||typeof row.id!=='string'||!row.id||row.id.includes('/')||ids.has(row.id))throw new Error('Task record IDs must be unique.');ids.add(row.id);}}
 const names=new Set<string>();
 for(const category of value.categories){if(typeof category.name!=='string'||!category.name.trim()||category.name.length>100||!Number.isInteger(category.order)||typeof category.archived!=='boolean')throw new Error('Check task category details.');const key=category.name.trim().toLowerCase();if(names.has(key))throw new Error('Task category names must be unique.');names.add(key);}
 for(const task of value.tasks){
  if(typeof task.title!=='string'||!task.title.trim()||task.title.length>200||!value.categories.some(c=>c.id===task.categoryId)||!taskStatuses.includes(task.status)||!['Low','Normal','High'].includes(task.priority)||typeof task.archived!=='boolean')throw new Error('Check task title, category, priority and status.');
  for(const key of ['notes','assignee','dueDate','dueAt','blockedReason','createdBy','updatedBy','completedAt','completedBy'] as const)if(typeof task[key]!=='string')throw new Error('Task details must be text.');
  if(task.notes.length>10000||task.blockedReason.length>2000||!Array.isArray(task.helpers)||task.helpers.some(id=>typeof id!=='string')||new Set(task.helpers).size!==task.helpers.length||task.helpers.includes(task.assignee))throw new Error('Check task notes and helpers.');
  if(task.dueDate&&!isDate(task.dueDate)||task.dueAt&&(!task.dueDate||!Number.isFinite(Date.parse(task.dueAt))))throw new Error('Enter a valid task due date/time.');
  if(task.status==='Blocked'&&!task.blockedReason.trim())throw new Error('Add a reason for the blocked task.');
  if(!Array.isArray(task.checklist)||task.checklist.length>50||task.checklist.some(item=>!item||typeof item.id!=='string'||!item.id||typeof item.title!=='string'||!item.title.trim()||item.title.length>300)||new Set(task.checklist.map(item=>item.id)).size!==task.checklist.length||!sameTaskValue(task.checklistIds,task.checklist.map(i=>i.id))||!Array.isArray(task.checkedSteps)||task.checkedSteps.some(id=>!task.checklistIds.includes(id))||new Set(task.checkedSteps).size!==task.checkedSteps.length)throw new Error('Check checklist steps (maximum 50).');
  if(task.link&&(!['event','property','guest'].includes(task.link.kind)||typeof task.link.id!=='string'||typeof task.link.name!=='string'))throw new Error('Check the linked record.');
  for(const at of [task.createdAt,task.updatedAt,...(task.completedAt?[task.completedAt]:[])])if(!Number.isFinite(Date.parse(at)))throw new Error('Task timestamps are invalid.');
  if((task.status==='Done')!==!!task.completedAt||!!task.completedAt!==!!task.completedBy)throw new Error('Task completion details are inconsistent.');
 }
 for(const event of value.activity)if(typeof event.taskId!=='string'||typeof event.action!=='string'||typeof event.actor!=='string'||typeof event.actorName!=='string'||!Number.isFinite(Date.parse(event.at)))throw new Error('Task activity is invalid.');
}
export function taskChanges(before:TaskData,after:TaskData){
 return taskKinds.flatMap(kind=>{const old=new Map<string,unknown>(before[kind].map(row=>[row.id,row])),next=new Map<string,unknown>(after[kind].map(row=>[row.id,row]));return [...new Set([...old.keys(),...next.keys()])].filter(id=>!sameTaskValue(old.get(id),next.get(id))).map(id=>({kind,id,value:next.get(id)}));});
}
export type TaskConflict={key:string;name:string;mine:unknown;cloud:unknown};
export function mergeTaskData(base:TaskData,mine:TaskData,cloud:TaskData,choices:Record<string,'mine'|'cloud'>={}){
 const data=structuredClone(cloud),conflicts:TaskConflict[]=[];
 for(const change of taskChanges(base,mine)){
  const previous=base[change.kind].find(row=>row.id===change.id),remote=cloud[change.kind].find(row=>row.id===change.id),key=change.kind+':'+change.id;
  if(sameTaskValue(remote,change.value))continue;
  if(!sameTaskValue(previous,remote)){conflicts.push({key,name:(change.value as {title?:string;name?:string})?.title||(change.value as {name?:string})?.name||change.id,mine:change.value,cloud:remote});if(choices[key]!=='mine')continue;}
  if(change.kind==='activity'&&previous)throw new Error('Existing task activity cannot be changed.');
  const rows=data[change.kind] as {id:string}[],index=rows.findIndex(row=>row.id===change.id);if(index>=0)rows.splice(index,1);if(change.value)rows.push(change.value as {id:string});
 }
 validateTasks(data);return {data,conflicts};
}
export function validateTaskChanges(before:TaskData,after:TaskData,role:TaskRole,uid:string,people:TaskPerson[]){
 validateTasks(after);if(role==='none')throw new Error('Task access is required.');
 for(const change of taskChanges(before,after)){
  const old=before[change.kind].find(row=>row.id===change.id);
  if(change.kind==='activity'){if(old||!change.value)throw new Error('Task activity is permanent.');continue;}
  if(change.kind==='categories'){if(!taskManager(role))throw new Error('Only task managers can manage categories.');continue;}
  const previous=old as WeddingTask|undefined,next=change.value as WeddingTask|undefined;
  if(!next)throw new Error('Archive tasks instead of deleting them.');
  if(!taskManager(role)){
   if(!previous||previous.archived||!assignedTo(previous,uid))throw new Error('You can update only your assigned tasks.');
   const allowed=new Set(['status','blockedReason','checkedSteps','updatedAt','updatedBy','completedAt','completedBy']);
   if(Object.keys({...previous,...next}).some(key=>!allowed.has(key)&&!sameTaskValue(previous[key as keyof WeddingTask],next[key as keyof WeddingTask]))||!sameTaskValue(previous.checklist.map(({id,title})=>({id,title})),next.checklist.map(({id,title})=>({id,title}))))throw new Error('Participants can update progress and checklist completion only.');
  }
  for(const id of [next.assignee,...next.helpers].filter(Boolean))if((!previous||!([previous.assignee,...previous.helpers].includes(id)))&&!people.some(p=>p.id===id&&p.active&&p.role!=='none'))throw new Error('Assign tasks to active task-team members.');
 }
}
export function planTaskBatches(before:TaskData,target:TaskData):TaskData[]{
 validateTasks(target);let current=structuredClone(before),pending=taskChanges(before,target),count=0;const batches:TaskData[]=[];
 while(pending.length){let advanced=false;
  for(let index=0;index<pending.length;){const next=structuredClone(current),change=pending[index],rows=next[change.kind] as {id:string}[],position=rows.findIndex(row=>row.id===change.id);if(position>=0)rows.splice(position,1);if(change.value)rows.push(change.value as {id:string});
   try{validateTasks(next);}catch{index++;continue;}current=next;pending.splice(index,1);count++;advanced=true;if(count===400){batches.push(structuredClone(current));count=0;}
  }
  if(!advanced){if(pending.length>400)throw new Error('Too many interdependent task changes. Sync a smaller set.');if(count){batches.push(structuredClone(current));count=0;}for(const change of pending){const rows=current[change.kind] as {id:string}[],position=rows.findIndex(row=>row.id===change.id);if(position>=0)rows.splice(position,1);if(change.value)rows.push(change.value as {id:string});}validateTasks(current);batches.push(structuredClone(current));pending=[];}
 }
 if(count)batches.push(current);return batches;
}
export const starterTaskCategories=['Venue & decoration','Clothing & jewellery','Invitations & guest follow-up','Accommodation','Transport & pickups','Catering','Photography & entertainment','Ceremony preparations','Personal preparation','Payments & follow-ups'];
