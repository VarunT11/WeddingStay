import {stayDate,stayDates,stayStatus} from './StayUI';
import { visibleNightRoom,roomAssignments,countOf, filterRooms, statusOf, summary, type Dataset, type Room } from './data.ts';

export type ReportScope = 'all' | 'current' | 'available';
export type ReportContext = { includeUnavailable?:boolean; area?: string; property?:string; guest?:string; status?: string; type?: string; query?: string; label?: string };
export type ReportOptions = { scope: ReportScope; includeContact: boolean; includeNotes: boolean };

export function reportSelection(data:Dataset,options:ReportOptions,context:ReportContext) {
 const filters=options.scope==='current'?context:options.scope==='available'?{status:'Available'}:{};
 const rooms=filterRooms(data.rooms.filter(r=>options.scope==='current'&&context.includeUnavailable||visibleNightRoom(r)),data.labels,filters,data.guests);
 const title=options.scope==='all'?'All booked rooms':options.scope==='available'?'Available rooms':'Current results';
 const descriptions:string[]=['Selected night: '+stayDate(data.viewDate||data.wedding.defaultDate,true),'Availability in this report covers the selected night. Bulk allocation checks every night in its chosen stay.'];
 if(options.scope==='current'){
  if(context.includeUnavailable)descriptions.push('Includes rooms not provided for this night. These rooms do not contribute to available capacity.');
  if(context.guest)descriptions.push('Guest group: '+(data.guests.find(g=>g.id===context.guest)?.name||context.guest));
  if(context.property)descriptions.push('Property: '+(data.properties.find(p=>p.id===context.property)?.name||context.property));
  if(context.area)descriptions.push('Area: '+(data.areas.find(a=>a.id===context.area)?.name||context.area));
  if(context.status)descriptions.push('Status: '+stayStatus(context.status));
  if(context.type)descriptions.push('Type: '+context.type);
  if(context.query?.trim())descriptions.push('Search: '+context.query.trim());
  if(context.label){const name=data.labels.find(l=>l.id===context.label)?.name||context.label;descriptions.push((context.status==='Available'?'Allocation context (rooms unassigned): ':'Label: ')+name);}
 }
 if(options.scope==='available')descriptions.push('Available rooms across the whole venue');
 return {rooms,title,descriptions,totals:summary(rooms)};
}

export async function generateReport(data:Dataset,options:ReportOptions,context:ReportContext,generatedAt=new Date()) {
 const selection=reportSelection(data,options,context);
 if(!selection.rooms.length)throw new Error('No rooms match this report. Change the scope or filters.');
 const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 const pageWidth=doc.internal.pageSize.getWidth(),pageHeight=doc.internal.pageSize.getHeight();
 const margin=13,width=pageWidth-margin*2;
 const wine:[number,number,number]=[116,51,70],ink:[number,number,number]=[75,63,58],muted:[number,number,number]=[145,125,112];
 const selectedDate=data.viewDate||data.wedding.defaultDate;
 doc.setProperties({title:data.wedding.name+' - '+selection.title,subject:'Accommodation for '+selectedDate,creator:'WeddingStay'});
 const generation='Generated '+generatedAt.toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 function pageHeader(first=false){
  doc.setFillColor(248,246,240);doc.rect(0,0,pageWidth,pageHeight,'F');
  doc.setFont('helvetica','bold');doc.setTextColor(...wine);doc.setFontSize(first?22:15);doc.text('WeddingStay',margin,first?22:17);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.text('NIGHT OF '+stayDate(selectedDate,true),pageWidth-margin,first?17:15,{align:'right'});
  if(first){doc.setFontSize(13);doc.setTextColor(...ink);doc.text(doc.splitTextToSize(data.wedding.name+' | Room report',width).slice(0,1),margin,32);doc.setFontSize(8);doc.setTextColor(...muted);doc.text(generation,pageWidth-margin,23,{align:'right'});}
  else{doc.setFontSize(8);doc.text('Room report | '+selection.title,margin,24);doc.text(generation,pageWidth-margin,23,{align:'right'});}
 }
 pageHeader(true);
 let y=41;
 doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...wine);doc.text(selection.title,margin,y);y+=6;
 const s=selection.totals;
 const countLine=`${selection.rooms.length} rooms shown | ${s.total} provided | ${s.available} available | ${s.allotted} reserved | ${s.occupied} checked in | ${s.assigned} assigned | ${s.arrived} arrived`;
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.text(countLine,margin,y);y+=6;
 for(const text of selection.descriptions){const lines=doc.splitTextToSize(text,width);doc.text(lines,margin,y);y+=lines.length*4+1;}
 const privateFields=[options.includeContact?'Contact numbers':null,options.includeNotes?'Allocation notes':null].filter(Boolean);
 if(privateFields.length){doc.text('Includes: '+privateFields.join(' and '),margin,y);y+=6;}
 y+=3;
 // All columns fit within a landscape A4 page. Names and optional details wrap.
 const fixed=[14,18,18,27,24,22,28,54,21,18];
 const extra=(options.includeContact?30:0)+(options.includeNotes?45:0);
 const available=width-extra;
 const widths=fixed.map(value=>value/fixed.reduce((a,b)=>a+b,0)*available);
 const headings=['Room','Type / suite','Status','Family / group','Linked guest group','Stay dates','Shared label','Occupants','Assigned / capacity','Arrived'];
 if(options.includeContact){headings.push('Contact');widths.push(30);}
 if(options.includeNotes){headings.push('Allocation notes');widths.push(45);}
 const columnStyles=Object.fromEntries(widths.map((cellWidth,index)=>[index,{cellWidth}]));
 const rows=(rooms:Room[])=>rooms.flatMap(room=>(roomAssignments(room).length?roomAssignments(room):[undefined]).map(allocation=>{
  const label=data.labels.find(l=>l.id===allocation?.labelId);
  const occupants=allocation?.headcountPending?'Guest count unknown':allocation?[...allocation.names,...(allocation.unnamed?['+'+allocation.unnamed+' unnamed guests']:[])].join('\n'):'-';
  const values=[room.number,room.special||room.type,allocation?(allocation.checkedIn?'Checked in':'Reserved'):room.booked===false?(room.availabilityReason==='room-unavailable'?'Unavailable this night':'Property not booked'):stayStatus(statusOf(room)),allocation?.group||'-',data.guests.find(g=>g.id===allocation?.guestGroupId)?.name||'-',allocation?stayDates(allocation.checkIn,allocation.checkOut):'-',label?.name||'-',occupants,allocation?.headcountPending?'Unknown':`${countOf(allocation)} / ${room.capacity}`,String(allocation?.arrived||0)];
  if(options.includeContact)values.push(allocation?.contact||'-');
  if(options.includeNotes)values.push(allocation?.notes||'-');
  return values;
 }));
 for(const area of data.properties.flatMap(property=>data.areas.filter(a=>a.propertyId===property.id))){
  const rooms=selection.rooms.filter(room=>room.areaId===area.id);if(!rooms.length)continue;
  if(y>pageHeight-46){doc.addPage();pageHeader();y=35;}
  const areaSummary=summary(rooms);
  const areaName=(data.properties.find(p=>p.id===area.propertyId)?.name||'Property')+' - '+area.name;
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...wine);doc.text(doc.splitTextToSize(areaName,width),margin,y);
  y+=doc.splitTextToSize(areaName,width).length*5;
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...muted);doc.text(`${rooms.length} rooms shown | ${areaSummary.total} provided | ${areaSummary.assigned} assigned | ${areaSummary.arrived} arrived`,margin,y);y+=4;
  let firstTablePage=true;
  autoTable(doc,{
   startY:y,margin:{left:margin,right:margin,top:37,bottom:15},tableWidth:width,head:[headings],body:rows(rooms),columnStyles,theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
   styles:{font:'helvetica',fontSize:7.3,cellPadding:2.8,textColor:ink,lineColor:[233,226,217],lineWidth:0.15,overflow:'linebreak',valign:'top'},
   headStyles:{fillColor:wine,textColor:[255,250,246],fontStyle:'bold',fontSize:7.2},alternateRowStyles:{fillColor:[250,248,244]},bodyStyles:{fillColor:[255,255,255]},
   willDrawPage:()=>{if(!firstTablePage){pageHeader();doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...wine);doc.text(doc.splitTextToSize(areaName+' (continued)',width).slice(0,1),margin,32);}firstTablePage=false;},
   didParseCell:cell=>{if(cell.section==='body'&&cell.column.index===2){const status=String(cell.cell.raw);cell.cell.styles.textColor=status==='Available'?[91,129,100]:status==='Reserved'?[163,124,58]:[93,131,161];cell.cell.styles.fontStyle='bold';}}
  });
  y=(doc as typeof doc&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+12;
 }
 const pages=doc.getNumberOfPages();
 for(let page=1;page<=pages;page++){
  doc.setPage(page);doc.setDrawColor(226,217,207);doc.line(margin,pageHeight-12,pageWidth-margin,pageHeight-12);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...muted);doc.text('WeddingStay | '+selectedDate+' | Current saved allocations',margin,pageHeight-7);doc.text(`Page ${page} of ${pages}`,pageWidth-margin,pageHeight-7,{align:'right'});
 }
 const stamp=`${generatedAt.getFullYear()}-${String(generatedAt.getMonth()+1).padStart(2,'0')}-${String(generatedAt.getDate()).padStart(2,'0')}-${String(generatedAt.getHours()).padStart(2,'0')}${String(generatedAt.getMinutes()).padStart(2,'0')}${String(generatedAt.getSeconds()).padStart(2,'0')}`;
 return {doc,filename:`weddingstay-${data.wedding.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'wedding'}-${selectedDate}-${options.scope}-${stamp}.pdf`};
}
