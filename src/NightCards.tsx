import {ArrowRight} from 'lucide-react';
import {type Dataset} from './data';
import {stayNights} from './stayNights';
import {nightPath} from './stayRoutes';
import {Link} from './navigation';
export function NightCards({data}:{data:Dataset}) {
 const nights=stayNights(data);
 return <>{nights.length?<div className="night-grid">{nights.map(n=><Link className="night-card" key={n.date} to={nightPath(n.date)}><div className="night-card-heading"><div><span className="eyebrow">NIGHT OF</span><h2>{new Date(n.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</h2></div><ArrowRight size={20}/></div><p>{n.properties.length} booked {n.properties.length===1?'property':'properties'}{n.properties.length?' · '+n.properties.map(p=>p.name).join(', '):' · Accommodation not booked yet'}</p><div className="night-counts"><span><strong>{n.rooms.length}</strong>Rooms entered</span><span><strong>{n.totals.available}</strong>Available</span><span><strong>{n.totals.allotted}</strong>Allotted</span><span><strong>{n.totals.occupied}</strong>Occupied</span></div><p>{n.remaining} rooms still required{n.inventoryPending?' · '+n.inventoryPending+' property inventories not entered':''}{n.overdue.length?' · '+n.overdue.length+' overdue occupied stays':''}</p></Link>)}</div>:<div className="planning-empty">No accommodation nights are planned yet. Add a property booking or a room requirement in Stays to get started.</div>}</>;
}
