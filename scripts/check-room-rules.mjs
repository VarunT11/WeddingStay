// Focused local regression check. Never connects to the real wedding project.
// Start Google's Firestore emulator on 127.0.0.1:8088 with firestore.rules first.
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,runTransaction,serverTimestamp,terminate} from 'firebase/firestore';
import assert from 'node:assert/strict';

const projectId='demo-weddingstay-room-rules',uid='room-test-owner';
const base=`http://127.0.0.1:8088/v1/projects/${projectId}/databases/(default)/documents`;
function fields(value){return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,typeof v==='string'?{stringValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{mapValue:{fields:fields(v)}}]));}
async function seed(path,data){const response=await fetch(base+'/'+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:fields(data)})});if(!response.ok)throw new Error(await response.text());}
const app=initializeApp({projectId,apiKey:'emulator-only'}),db=getFirestore(app);
connectFirestoreEmulator(db,'127.0.0.1',8088,{mockUserToken:{sub:uid,email:'owner@example.test'}});
try{
 for(const categoryCount of [0,25]){
  const wedding='case-'+categoryCount,root=doc(db,'weddings',wedding);
  await seed(`weddings/${wedding}`,{state:'ready',revision:6,collectionRevisions:{rooms:0,guestCategories:0},updatedBy:uid});
  await seed(`weddings/${wedding}/members/${uid}`,{role:'owner',active:true});
  await runTransaction(db,async tx=>{
   const current=await tx.get(root);assert.equal(current.data().revision,6);
   for(let i=0;i<categoryCount;i++){const id='category-'+i;tx.set(doc(root,'guestCategories',id),{data:{id,name:'Category '+i},deleted:false,revision:7,updatedBy:uid,updatedAt:serverTimestamp()});}
   tx.set(doc(root,'rooms','new-room'),{data:{id:'new-room',number:'101',areaId:'test-area',type:'Normal',capacity:4},deleted:false,revision:7,updatedBy:uid,updatedAt:serverTimestamp()});
   tx.update(root,{revision:7,clientSchema:2,schemaRevision:7,collectionRevisions:{rooms:7,guestCategories:categoryCount?7:0},updatedBy:uid,updatedAt:serverTimestamp()});
  });
  console.log(`PASS: Owner creates room with ${categoryCount} category migration writes`);
 }
}finally{await terminate(db);await deleteApp(app);}
