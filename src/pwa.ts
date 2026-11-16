/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite/client" />
import {useEffect,useState} from 'react';
import {useRegisterSW} from 'virtual:pwa-register/react';

async function offlineAssetsReady(){
 try{
  const list=await caches.match(new URL(import.meta.env.BASE_URL+'offline-assets.json',location.origin).href,{ignoreSearch:true});
  if(!list)return false;
  const paths:unknown=await list.json();if(!Array.isArray(paths)||!paths.length)return false;
  const cached=await Promise.all(paths.map(path=>typeof path==='string'?caches.match(new URL(path,location.origin).href,{ignoreSearch:true}):undefined));
  return cached.every(Boolean);
 }catch{return false;}
}

export function useOfflineApp(){
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const {offlineReady:[offlineReady],needRefresh:[needRefresh],updateServiceWorker}=useRegisterSW({
  onOfflineReady(){void offlineAssetsReady().then(setReady);},
  onRegisterError(){setError('Offline setup could not finish. Check your connection to the app and reopen it.');},
  onRegisteredSW(_url,registration){if(registration?.active)void offlineAssetsReady().then(setReady);}
 });
 useEffect(()=>{if(offlineReady)void offlineAssetsReady().then(setReady);},[offlineReady]);
 return {ready,needRefresh,error,update:async()=>{try{await updateServiceWorker(true);}catch{setError('The update could not be applied. Check your connection to the app and try again.');}},enabled:import.meta.env.PROD};
}
