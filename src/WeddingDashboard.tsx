import {AppLogo} from './AppLogo';
import {ArrowRight,ArrowUpRight,BedDouble,CalendarDays,Users,UserRound,UserRoundSearch} from 'lucide-react';
import {localToday,type Dataset} from './data';
import {NightCards} from './NightCards';
import {EventCards,OverdueAttention} from './DashboardExtras';
import {Link} from './navigation';
import './dashboard.css';
export function WeddingDashboard({data}:{data:Dataset}) {
 const events=[...data.events].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))||a.name.localeCompare(b.name));
 const nextEvent=events.find(event=>event.date>=localToday());
 const metrics=[{label:'Guest groups',value:data.guests.length,note:'Families, groups or individuals',url:'/guests',icon:<Users/>},{label:'Listed guests',value:data.guests.reduce((s,g)=>s+(g.headcount??0),0),note:'From recorded headcounts',url:'/guests',icon:<UserRound/>},{label:'Groups missing headcount',value:data.guests.filter(g=>g.headcount===null).length,note:'Guest counts still to be added',url:'/guests',icon:<UserRoundSearch/>},{label:'Events',value:data.events.length,note:'Across the full celebration',url:'/events',icon:<CalendarDays/>}];
 return <div className="wedding-dashboard"><div className="page-heading wedding-dashboard-header"><div className="wedding-dashboard-copy"><p className="eyebrow">YOUR WEDDING AT A GLANCE</p><h1>{data.wedding.name}</h1><p className="page-description">{nextEvent?<>Up next: <strong>{nextEvent.name}</strong> · {new Date(nextEvent.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</>:'Your people, events and accommodation, all in one place.'}</p><div className="dashboard-actions"><Link className="button secondary" to="/events"><CalendarDays size={17}/>Review RSVPs</Link><Link className="button primary" to="/stays"><BedDouble size={17}/>Plan rooms<ArrowUpRight size={16}/></Link></div></div><div className="wedding-dashboard-art wedding-logo-dashboard"><AppLogo variant="full"/><AppLogo decorative/></div></div>
 <div className="metric-grid">{metrics.map(m=><Link key={m.label} className="metric total" to={m.url}><div className="metric-top"><span>{m.label}</span><span className="metric-icon">{m.icon}</span></div><strong>{m.value}</strong><div className="metric-bottom"><span>{m.note}</span><ArrowUpRight size={16}/></div></Link>)}</div>
 <p className="inventory-hint dashboard-count-note">Listed guests total the recorded headcounts. Missing counts and duplicate records can affect this total.</p>
 <OverdueAttention data={data}/><div className="section-heading area-heading"><h2>Your celebrations</h2><Link className="text-link" to="/events">All events<ArrowRight size={15}/></Link></div><EventCards data={data} events={events} variant="dashboard"/>
 <div className="section-heading area-heading"><div><h2>Accommodation, night by night</h2><p>{data.rooms.length} rooms entered across {data.properties.length} properties · inventory shared across nights</p></div><Link className="text-link" to="/stays">All stays<ArrowRight size={15}/></Link></div><NightCards data={data}/>
 </div>;
}
