import {type WeddingScope} from './weddingScope';

const selectionKey=(projectId:string,uid:string)=>'weddingstay.lastWedding.'+[projectId,uid].map(encodeURIComponent).join(':');
export function lastOpenedWedding(projectId:string,uid:string):string|null{
 try{const id=localStorage.getItem(selectionKey(projectId,uid));return id&&!id.includes('/')?id:null;}catch{return null;}
}
export function rememberOpenedWedding(scope:WeddingScope){
 try{localStorage.setItem(selectionKey(scope.projectId,scope.uid),scope.weddingId);}catch{/* Remembering a choice is optional. */}
}
export function forgetOpenedWedding(scope:WeddingScope){
 try{if(lastOpenedWedding(scope.projectId,scope.uid)===scope.weddingId)localStorage.removeItem(selectionKey(scope.projectId,scope.uid));}catch{/* Local preferences may be unavailable. */}
}
