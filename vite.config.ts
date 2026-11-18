import { defineConfig,loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({mode})=>{
 const environment=loadEnv(mode,process.cwd(),'VITE_FIREBASE_');
 if(mode==='pages'&&['API_KEY','AUTH_DOMAIN','PROJECT_ID','APP_ID'].some(key=>!environment['VITE_FIREBASE_'+key]))throw new Error('Firebase web configuration is required for the Pages build. Set the four VITE_FIREBASE_* repository variables.');
 const base=mode==='pages'?'/WeddingStay/':'/';
 return {base,plugins: [react(), {
 name:'weddingstay-offline-assets',
 generateBundle(_options,bundle){
  const assets=[...Object.keys(bundle).filter(name=>/\.(js|css|html)$/.test(name)),'index.html','manifest.webmanifest','wedding-logo.jpeg','ph-monogram.png','ph-favicon-32.png','ph-favicon-64.png','ph-icon-192.png','ph-icon-512.png','ph-icon-maskable.png','ph-apple-touch-icon.png'];
  this.emitFile({type:'asset',fileName:'offline-assets.json',source:JSON.stringify([...new Set(assets)].map(name=>base+name))});
 }
 }, VitePWA({
 registerType:'prompt',
 includeAssets:['wedding-logo.jpeg','ph-monogram.png','ph-favicon-32.png','ph-favicon-64.png','ph-apple-touch-icon.png'],
 scope:base,
 manifest:{id:base,name:'WeddingStay',short_name:'WeddingStay',description:'Room for celebration. Personal wedding accommodation.',start_url:base,scope:base,display:'standalone',background_color:'#f8f7f3',theme_color:'#743346',icons:[{src:base+'ph-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:base+'ph-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:base+'ph-icon-maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},
 workbox:{globPatterns:['**/*.{js,css,html,png,jpg,jpeg,svg,ico,webmanifest,json}'],navigateFallback:base+'index.html',cleanupOutdatedCaches:true,skipWaiting:false,clientsClaim:true},
 devOptions:{enabled:false}
 })] };
});
