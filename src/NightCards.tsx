import {WeddingArt} from './WeddingArt';
import {ArrowRight} from 'lucide-react';
import {type Dataset} from './data';
import {stayNights} from './stayNights';
import {nightPath} from './stayRoutes';
import {Link} from './navigation';
export function NightCards({data}:{data:Dataset}) {
 const nights=stayNights(data);
 return <>{nights.length?<div className="night-grid">{nights.map(n=><Link className="night-card" key={n.date} to={nightPath(n.date)}><div className="night-card-heading"><div><span className="eyebrow">NIGHT OF</span><h2>{new Date(n.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</h2></div><ArrowRight size={20}/></div><p>{n.properties.length} booked {n.properties.length===1?'property':'properties'}{n.properties.length?' · '+n.properties.map(p=>p.name).join(', '):''}</p>
 {(n.remaining>0||n.inventoryPending>0||!n.properties.length||n.overdue.length>0)&&<div className="night-status-badges">
  {n.remaining>0&&<span className="night-status-badge shortfall">{n.remaining} more {n.remaining===1?'room':'rooms'} needed</span>}
  {n.inventoryPending>0&&<span className="night-status-badge inventory-missing">Room details missing for {n.inventoryPending} {n.inventoryPending===1?'property':'properties'}</span>}
  {!n.properties.length&&<span className="night-status-badge inventory-missing">Accommodation not booked</span>}
  {n.overdue.length>0&&<span className="night-status-badge shortfall">{n.overdue.length} overdue occupied {n.overdue.length===1?'stay':'stays'}</span>}
 </div>}
 <div className="night-counts"><span><strong>{n.rooms.length}</strong>Rooms entered</span><span><strong>{n.inventoryPending&&!n.rooms.length?'—':n.totals.available}</strong>{n.inventoryPending||!n.properties.length?'Available (entered)':'Available'}</span><span><strong>{n.totals.allotted}</strong>Reserved</span><span><strong>{n.totals.occupied}</strong>Checked in</span></div></Link>)}</div>:<div className="planning-empty wedding-planning-empty"><WeddingArt kind="stay" className="wedding-empty-art"/><p>No accommodation nights are planned yet. Add a property booking or a room need in Stays to get started.</p></div>}</>;
}
