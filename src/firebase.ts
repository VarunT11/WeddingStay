import {getApp,getApps,initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';

const config={apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,appId:import.meta.env.VITE_FIREBASE_APP_ID};
export const firebaseConfigured=Object.values(config).every(value=>typeof value==='string'&&value.trim());
const app=firebaseConfigured?(getApps().length?getApp():initializeApp(config)):null;
export const auth=app?getAuth(app):null;
// Deliberately use the default memory cache. Offline copies are isolated by account below.
export const database=app?getFirestore(app):null;
export const weddingId='main';
export async function googleSignIn(){if(!auth)throw new Error('Firebase configuration is missing.');const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
export async function firebaseSignOut(){if(auth)await signOut(auth);}
export function cloudError(error:unknown){
 const code=(error as {code?:string})?.code;
 if(code==='auth/popup-closed-by-user')return 'Sign-in was closed. You can try again.';
 if(code==='auth/popup-blocked')return 'Allow the sign-in popup for WeddingStay, then try again.';
 if(code==='permission-denied')return 'Your account no longer has access. Ask the wedding owner to review your membership.';
 if(code==='unavailable'||code==='auth/network-request-failed')return 'The cloud cannot be reached. Check your internet connection and try again.';
 return error instanceof Error?error.message:'The cloud request could not be completed.';
}
