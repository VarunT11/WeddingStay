import {createContext,useContext} from 'react';
import {auth,database,firebaseProjectId} from './firebase';
import {doc} from 'firebase/firestore';

export type WeddingScope=Readonly<{projectId:string;uid:string;weddingId:string}>;
export const WeddingScopeContext=createContext<WeddingScope|null>(null);
export const scopeKey=(scope:WeddingScope)=>[scope.projectId,scope.uid,scope.weddingId].map(encodeURIComponent).join(':');
export function sameScope(a:WeddingScope|undefined,b:WeddingScope){return !!a&&a.projectId===b.projectId&&a.uid===b.uid&&a.weddingId===b.weddingId;}
export function assertScope(scope:WeddingScope){if(!database||scope.projectId!==firebaseProjectId||auth?.currentUser?.uid!==scope.uid||!scope.weddingId||scope.weddingId.includes('/'))throw new Error('The wedding or account changed. Reopen the original wedding before continuing.');}
export function weddingRef(scope:WeddingScope){assertScope(scope);return doc(database!,'weddings',scope.weddingId);}
export function usePreferenceKey(key:string){const scope=useContext(WeddingScopeContext);return scope?'weddingstay.preference.'+scopeKey(scope)+'.'+key:key;}
