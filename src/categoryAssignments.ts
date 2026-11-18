import {parseDataset} from './transfer';
import {normalizeData,type Dataset,type GuestCategory} from './data';

export type CategoryAssignment={guestId:string;category:string};
export type CategoryImportFile={assignments:CategoryAssignment[]};
export function parseCategoryImport(contents:string):CategoryImportFile{
 let raw:any;try{raw=JSON.parse(contents);}catch{throw new Error('Choose a valid WeddingStay JSON export.');}
 if(raw?.version!==3||!Array.isArray(raw.guests))throw new Error('Choose a WeddingStay version-3 export with its guest list.');
 const names=new Map<string,string>((raw.guestCategories||[]).map((category:any)=>[category.id,category.name]));
 const assignments:CategoryAssignment[]=raw.guests.map((guest:any)=>{
  if(!guest||typeof guest.id!=='string')throw new Error('Every guest must have an existing guest ID.');
  if(guest.category!==undefined&&typeof guest.category!=='string')throw new Error('Guest categories must be text.');
  const desired=guest.category!==undefined?guest.category.trim():guest.categoryId?names.get(guest.categoryId):'';
  if(typeof desired!=='string')throw new Error('A guest refers to a category missing from the file.');
  return {guestId:guest.id,category:desired.trim()};
 });
 // Validate all original records too, without losing explicit category text to normalisation.
 parseDataset(contents);
 return {assignments};
}
export function categoryImportPreview(data:Dataset,file:CategoryImportFile){
 const categories=[...data.guestCategories],byName=new Map(categories.map(category=>[category.name.trim().toLocaleLowerCase(),category]));
 const existing=new Map(data.guests.map(guest=>[guest.id,guest]));
 const added:GuestCategory[]=[],changes:{guestId:string;name:string;before:string;after:string;categoryId:string}[]=[],unmatched:string[]=[];
 let blanks=0,unchanged=0;
 for(const assignment of file.assignments){
  const guest=existing.get(assignment.guestId);
  if(!guest){unmatched.push(assignment.guestId);continue;}
  if(!assignment.category){blanks++;continue;}
  const normalized=assignment.category.toLocaleLowerCase();
  let category=byName.get(normalized);
  if(!category){category={id:crypto.randomUUID(),name:assignment.category};byName.set(normalized,category);categories.push(category);added.push(category);}
  if(guest.categoryId===category.id&&guest.category===category.name){unchanged++;continue;}
  changes.push({guestId:guest.id,name:guest.name,before:guest.category||'Uncategorised',after:category.name,categoryId:category.id});
 }
 return {added,changes,unmatched,blanks,unchanged,totalWrites:added.length+changes.length};
}
export function applyCategoryImport(data:Dataset,preview:ReturnType<typeof categoryImportPreview>,offline=false):Dataset{
 if(!offline&&preview.totalWrites>440)throw new Error('This import changes more than 440 records. Use a smaller file; nothing has been applied.');
 const now=new Date().toISOString(),changes=new Map(preview.changes.map(change=>[change.guestId,change]));
 return normalizeData({...data,updatedAt:now,guestCategories:[...data.guestCategories,...preview.added.map(category=>({...category,createdAt:now,updatedAt:now}))],guests:data.guests.map(guest=>{const change=changes.get(guest.id);return change?{...guest,categoryId:change.categoryId,category:change.after,updatedAt:now}:guest;})});
}
