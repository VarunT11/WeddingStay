import {collection,doc,getDocFromServer,getDocsFromServer,onSnapshot,query,where,writeBatch,serverTimestamp,type Unsubscribe} from 'firebase/firestore';
import {type User} from 'firebase/auth';
import {auth,database} from './firebase';
import {assertScope,weddingRef,type WeddingScope} from './weddingScope';
export type WeddingRole='owner'|'coordinator';
export type WeddingListing={id:string;name:string;defaultDate?:string};
export const accessDenied=()=>Object.assign(new Error('Your access to this wedding has been revoked.'),{code:'permission-denied',confirmedRevocation:true});
export const isAccessRevoked=(cause:unknown)=>(cause as {confirmedRevocation?:boolean})?.confirmedRevocation===true;
function account(){const uid=auth?.currentUser?.uid;if(!database||!uid)throw new Error('Sign in to continue.');return uid;}
export async function verifyWeddingAccess(scope:WeddingScope):Promise<WeddingRole>{
 assertScope(scope);const owner=await getDocFromServer(doc(database!,'appOwners',scope.uid));assertScope(scope);
 if(owner.data()?.active===true)return 'owner';
 const member=await getDocFromServer(doc(weddingRef(scope),'members',scope.uid));assertScope(scope);
 if(member.data()?.active===true&&['coordinator','owner'].includes(member.data()?.role))return 'coordinator';
 throw accessDenied();
}
export function watchWeddingAccess(scope:WeddingScope,onRole:(role:WeddingRole)=>void,onPending:()=>void,onError:(cause:unknown)=>void):Unsubscribe{
 let stopped=false,generation=0,memberStop:Unsubscribe|undefined;
 const ownerStop=onSnapshot(doc(database!,'appOwners',scope.uid),{includeMetadataChanges:true},owner=>{
  if(stopped||auth?.currentUser?.uid!==scope.uid)return;
  if(owner.metadata.fromCache||owner.metadata.hasPendingWrites){onPending();return;}
  const session=++generation;memberStop?.();memberStop=undefined;
  if(owner.data()?.active===true){onRole('owner');return;}
  memberStop=onSnapshot(doc(weddingRef(scope),'members',scope.uid),{includeMetadataChanges:true},member=>{
   if(stopped||session!==generation||auth?.currentUser?.uid!==scope.uid)return;
   if(member.metadata.fromCache||member.metadata.hasPendingWrites){onPending();return;}
   if(member.data()?.active===true&&['coordinator','owner'].includes(member.data()?.role))onRole('coordinator');else onError(accessDenied());
  },onError);
 },onError);
 return()=>{stopped=true;generation++;ownerStop();memberStop?.();};
}
export async function registerProfile(user:User){
 if(!database||account()!==user.uid)throw new Error('The account changed.');
 const ref=doc(database,'users',user.uid),existing=await getDocFromServer(ref);
 const displayName=user.displayName||user.email||'Member',email=user.email||'';
 if(existing.data()?.displayName===displayName&&existing.data()?.email===email)return;
 if(account()!==user.uid)throw new Error('The account changed.');
 const batch=writeBatch(database);batch.set(ref,{displayName,email,updatedAt:serverTimestamp(),...(existing.exists()?{}:{createdAt:serverTimestamp()})},{merge:true});await batch.commit();
}
export async function weddingDirectory():Promise<{owner:boolean;weddings:WeddingListing[]}>{
 const uid=account(),owner=(await getDocFromServer(doc(database!,'appOwners',uid))).data()?.active===true;
 if(account()!==uid)throw new Error('The account changed.');
 const result=await getDocsFromServer(owner?collection(database!,'weddings'):query(collection(database!,'users',uid,'weddings'),where('active','==',true)));
 if(account()!==uid)throw new Error('The account changed.');
 const weddings=await Promise.all(result.docs.map(async item=>{const value=owner?item.data():(await getDocFromServer(doc(database!,'weddings',item.id))).data();return {id:item.id,name:value?.wedding?.name||item.data().weddingName||item.id,defaultDate:value?.wedding?.defaultDate};}));
 return {owner,weddings:weddings.sort((a,b)=>a.name.localeCompare(b.name))};
}
export async function setWeddingMember(scope:WeddingScope,uid:string,name:string,active:boolean){
 if(await verifyWeddingAccess(scope)!=='owner')throw accessDenied();
 if(!uid||uid.includes('/'))throw new Error('Choose a registered user.');
 const member=doc(weddingRef(scope),'members',uid),index=doc(database!,'users',uid,'weddings',scope.weddingId),old=await getDocFromServer(member),profile=await getDocFromServer(doc(database!,'users',uid));
 const batch=writeBatch(database!);
 batch.set(member,{role:'coordinator',active,displayName:profile.data()?.displayName||uid,taskRole:old.data()?.taskRole||'none',updatedBy:scope.uid,updatedAt:serverTimestamp(),...(old.data()?.grantedBy&&old.data()?.grantedAt?{grantedBy:old.data()!.grantedBy,grantedAt:old.data()!.grantedAt}:{grantedBy:scope.uid,grantedAt:serverTimestamp()})});
 batch.set(index,{weddingId:scope.weddingId,weddingName:name.slice(0,200),active,updatedBy:scope.uid,updatedAt:serverTimestamp()});
 assertScope(scope);await batch.commit();
}
export async function repairWeddingMembers(scope:WeddingScope,name:string){
 if(await verifyWeddingAccess(scope)!=='owner')throw accessDenied();
 const members=await getDocsFromServer(collection(weddingRef(scope),'members'));
 for(let start=0;start<members.docs.length;start+=8){
  assertScope(scope);const batch=writeBatch(database!);
  for(const member of members.docs.slice(start,start+8)){
   const value=member.data(),active=value.active===true,profile=await getDocFromServer(doc(database!,'users',member.id));
   batch.set(member.ref,{role:'coordinator',active,displayName:profile.data()?.displayName||member.id,taskRole:value.taskRole||'none',updatedBy:scope.uid,updatedAt:serverTimestamp(),...(value.grantedBy&&value.grantedAt?{grantedBy:value.grantedBy,grantedAt:value.grantedAt}:{grantedBy:scope.uid,grantedAt:serverTimestamp()})});
   batch.set(doc(database!,'users',member.id,'weddings',scope.weddingId),{weddingId:scope.weddingId,weddingName:name.slice(0,200),active,updatedBy:scope.uid,updatedAt:serverTimestamp()});
  }
  await batch.commit();
 }
 return members.size;
}
