import {useId} from 'react';

type ArtKind='arch'|'invitation'|'celebration'|'stay';
const ink='#743346',gold='#B18D52',saffron='#CC9450',sage='#879580',paper='#FFFDF9';

function Blossom({x=0,y=0,r=9,colour=gold}:{x?:number;y?:number;r?:number;colour?:string}){
 return <g transform={`translate(${x} ${y})`} fill={colour}>{Array.from({length:8},(_,i)=><ellipse key={i} cx="0" cy={-r*.62} rx={r*.27} ry={r*.48} transform={`rotate(${i*45})`} opacity={i%2?.8:1}/>)}<circle r={r*.26} fill={paper}/><circle r={r*.12} fill={ink}/></g>;
}
function Branch({flip=false}:{flip?:boolean}){
 return <g transform={flip?'translate(320 0) scale(-1 1)':undefined} fill="none" stroke={sage} strokeWidth="1.2" strokeLinecap="round"><path d="M31 210C70 171 43 124 80 88M48 187C36 173 35 154 39 140M55 155C73 146 79 135 81 121M59 125C49 112 51 99 56 91"/>{[[39,151,-24],[43,172,-36],[64,149,51],[76,130,35],[57,110,-33],[71,100,32]].map(([x,y,a],i)=><path key={i} transform={`translate(${x} ${y}) rotate(${a})`} d="M0 0C-10-5-12-15-8-21C0-18 4-9 0 0Z" fill={sage} fillOpacity=".19"/>)}<Blossom x={81} y={85} r={10} colour={saffron}/><Blossom x={39} y={136} r={7} colour="#B98589"/></g>;
}
export function WeddingFlower({className=''}:{className?:string}){
 return <svg className={'wedding-flower '+className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32" aria-hidden="true" focusable="false"><g transform="translate(20 20)">{Array.from({length:8},(_,i)=><path key={i} d="M0-3C-9-8-7-17 0-18C7-17 9-8 0-3Z" transform={`rotate(${i*45})`} fill={i%2?'#F1E4D0':'#F3E3E7'} stroke={ink} strokeWidth=".9"/>)}<circle r="5" fill={gold}/><circle r="2" fill={paper}/></g></svg>;
}
export function WeddingFlourish({className=''}:{className?:string}){
 return <svg className={'wedding-flourish '+className} viewBox="0 0 160 28" width="160" height="28" aria-hidden="true" focusable="false"><path d="M5 14H54M106 14H155M49 14L57 10L65 14L57 18ZM95 14L103 10L111 14L103 18Z" fill="none" stroke={gold} strokeWidth=".8"/><Blossom x={80} y={14} r={11}/><circle cx="5" cy="14" r="1.6" fill={gold}/><circle cx="155" cy="14" r="1.6" fill={gold}/></svg>;
}
export function WeddingArt({kind='arch',className=''}:{kind?:ArtKind;className?:string}){
 const patternId=useId().replace(/:/g,'')+'-jaali';
 return <svg className={'wedding-art wedding-art-'+kind+' '+className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240" aria-hidden="true" focusable="false">
 <defs><pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 0L24 12L12 24L0 12ZM0 0L24 24M24 0L0 24" fill="none" stroke={gold} strokeWidth=".55" opacity=".28"/></pattern></defs>
 <ellipse cx="160" cy="221" rx="112" ry="7" fill="#DCCDAD" opacity=".17"/>
 {kind==='arch'?<>
 <path d="M69 216V105a91 91 0 0 1 182 0v111" fill="#F3EBDE" stroke={gold} strokeWidth="1.2"/>
 <path d="M80 216V106a80 80 0 0 1 160 0v110" fill={paper} stroke={gold} strokeWidth=".8"/>
 <path d="M91 211V106a69 69 0 0 1 138 0v105" fill={`url(#${patternId})`} stroke="#D6C3A1" strokeWidth=".7"/>
 <path d="M109 211V111a51 51 0 0 1 102 0v100" fill="#FCF7F0" stroke={gold} strokeWidth=".8"/>
 <path d="M122 210V115a38 38 0 0 1 76 0v95" fill="#F6EEE6"/>
 <path d="M83 80Q160 119 237 80M91 68Q160 98 229 68" fill="none" stroke={gold} strokeWidth=".8"/>
 {[97,115,136,160,184,205,223].map((x,i)=><g key={x}><path d={`M${x} ${80+Math.sin(i/6*Math.PI)*20}v${i%2?15:24}`} stroke={gold} strokeWidth=".8"/><Blossom x={x} y={105+Math.sin(i/6*Math.PI)*17+(i%2?-8:0)} r={5.5} colour={saffron}/></g>)}
 <path d="M65 216H255M73 222H247" stroke={gold} strokeWidth="1"/><Branch/><Branch flip/>
 <g transform="translate(160 164)" fill="none" stroke={ink} strokeWidth="1.4"><circle cx="-8" cy="0" r="14"/><circle cx="8" cy="0" r="14"/><path d="M-10-19L-6-23L-2-19L-6-15ZM7-19L11-23L15-19L11-15Z" fill="#F1E2C7" stroke={gold}/></g>
 <Blossom x={160} y={20} r={9}/><circle cx="49" cy="69" r="2" fill={gold}/><circle cx="269" cy="59" r="2" fill={gold}/><path d="M275 124h8m-4-4v8M36 103h6m-3-3v6" stroke={gold} strokeWidth=".8"/>
 </>:kind==='invitation'?<>
 <circle cx="160" cy="124" r="91" fill="#F4ECE4"/><Branch/><Branch flip/>
 <g transform="rotate(-7 160 130)"><rect x="100" y="35" width="120" height="145" rx="5" fill={paper} stroke={gold} strokeWidth="1.2"/><rect x="108" y="43" width="104" height="129" rx="2" fill="none" stroke="#D9C6A6" strokeWidth=".65"/><Blossom x={160} y={68} r={12}/><path d="M129 96h62m-52 11h42m-53 16h64m-55 11h46" stroke="#B29B8F" strokeWidth="1.1"/></g>
 <path d="M73 124L160 77L247 124V211H73Z" fill="#EFE0D8" stroke={gold} strokeWidth="1.1"/><path d="M73 124L160 181L247 124M73 211L132 164M247 211L188 164" fill="none" stroke={gold} strokeWidth=".9"/><path d="M74 211L142 167Q160 155 178 167L246 211" fill="#F6EBE3" stroke={gold} strokeWidth=".8"/><circle cx="160" cy="173" r="15" fill={ink}/><Blossom x={160} y={173} r={10} colour="#DEC393"/>
 </>:kind==='celebration'?<>
 <path d="M72 215V110a88 88 0 0 1 176 0v105" fill="#F3EBDE"/><Branch/><Branch flip/>
 <rect x="91" y="66" width="138" height="141" rx="8" fill={paper} stroke={gold} strokeWidth="1.3"/><path d="M91 101H229" stroke={gold}/><path d="M91 75Q160 103 229 75" fill="none" stroke={gold}/>
 {[110,135,160,185,210].map((x,i)=><Blossom key={x} x={x} y={80+Math.sin(i/4*Math.PI)*12} r={5.5} colour={saffron}/>)}
 <path d="M119 54V76M201 54V76" stroke={ink} strokeWidth="3" strokeLinecap="round"/>
 {[0,1,2].map(row=>[0,1,2].map(col=><circle key={row+'-'+col} cx={126+col*34} cy={128+row*26} r="3" fill="#CEBFAE"/>))}<circle cx="160" cy="154" r="12" fill="#F0DFE5" stroke={ink} strokeWidth="1"/><Blossom x={160} y={154} r={8} colour={ink}/>
 <Blossom x={243} y={55} r={13} colour={saffron}/><path d="M64 216H256" stroke={gold}/>
 </>:<>
 <path d="M76 217V101a84 84 0 0 1 168 0v116" fill="#F1E8DC" stroke={gold} strokeWidth="1.1"/>
 <path d="M89 215V102a71 71 0 0 1 142 0v113" fill={`url(#${patternId})`} stroke={gold} strokeWidth=".7"/>
 <path d="M111 215V108a49 49 0 0 1 98 0v107" fill={paper} stroke={ink} strokeWidth="1.2"/><path d="M122 207V111a38 38 0 0 1 76 0v96Z" fill="#F4E9E3" stroke="#D3BBA8" strokeWidth=".7"/><path d="M160 73V207" stroke="#D3BBA8" strokeWidth=".7"/><circle cx="171" cy="155" r="2.8" fill={gold}/>
 <Branch/><Branch flip/><path d="M68 217H252M80 223H240" stroke={gold}/><Blossom x={160} y={33} r={9}/>
 <g transform="translate(231 158) rotate(24)"><circle r="15" fill={paper} stroke={gold} strokeWidth="1.7"/><circle r="6" fill="none" stroke={gold}/><path d="M0 15V53H10V45H4V36H11V30H0" fill="#F1E2C7" stroke={gold} strokeWidth="1.5" strokeLinejoin="round"/></g>
 </>}
 </svg>;
}
