import {ArrowRight,ArrowUpRight,BedDouble,CalendarDays,Users} from 'lucide-react';
import {type Dataset} from './data';
import {NightCards} from './NightCards';
import {EventCards,OverdueAttention} from './DashboardExtras';
import {Link} from './navigation';
export function WeddingDashboard({data}:{data:Dataset}) {
 const metrics=[{label:'Guest entries',value:data.guests.length,note:'Families, groups or individuals',url:'/guests',icon:<Users/>},{label:'Known listed headcount',value:data.guests.reduce((s,g)=>s+(g.headcount??0),0),note:'May overlap across events',url:'/guests',icon:<Users/>},{label:'Headcounts pending',value:data.guests.filter(g=>g.headcount===null).length,note:'Entries with unknown counts',url:'/guests',icon:<Users/>},{label:'Events',value:data.events.length,note:'Across the full celebration',url:'/events',icon:<CalendarDays/>}];
 return <><div className="page-heading"><div><p className="eyebrow">YOUR WEDDING AT A GLANCE</p><h1>Every guest. One celebration.</h1><p className="page-description">Your people, events and accommodation, all in one place.</p></div><Link className="button primary" to="/stays"><BedDouble size={17}/>Explore stays<ArrowUpRight size={16}/></Link></div>
 <div className="metric-grid">{metrics.map(m=><Link key={m.label} className="metric total" to={m.url}><div className="metric-top"><span>{m.label}</span><span className="metric-icon">{m.icon}</span></div><strong>{m.value}</strong><div className="metric-bottom"><span>{m.note}</span><ArrowUpRight size={16}/></div></Link>)}</div>
 <p className="inventory-hint">Guest entries can repeat across events. Listed headcounts are not a unique-person total.</p>
 <OverdueAttention data={data}/><div className="section-heading area-heading"><h2>Your celebrations</h2><Link className="text-link" to="/events">All events<ArrowRight size={15}/></Link></div><EventCards data={data} events={[...data.events].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))||a.name.localeCompare(b.name))}/>
 <div className="section-heading area-heading"><div><h2>Accommodation, night by night</h2><p>{data.rooms.length} rooms entered across {data.properties.length} properties · inventory shared across nights</p></div><Link className="text-link" to="/stays">All stays<ArrowRight size={15}/></Link></div><NightCards data={data}/>
 </>;
}
