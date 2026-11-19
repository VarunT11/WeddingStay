import {useContext} from 'react';
import {WeddingScopeContext} from './weddingScope';

type Props={variant?:'full'|'compact';className?:string;decorative?:boolean};
export function AppLogo({variant='compact',className='',decorative=false}:Props){
 const scope=useContext(WeddingScopeContext);
 const originalWedding=scope?.projectId==='weddingstay-d0be2'&&scope.weddingId==='main';
 const full=variant==='full',asset=originalWedding?(full?'wedding-logo.jpeg':'ph-monogram.png'):'icon.svg';
 const size=originalWedding&&full?1254:512;
 return <img className={`app-logo app-logo-${variant} ${className}`} src={import.meta.env.BASE_URL+asset} width={size} height={size} alt={decorative?'':originalWedding?'Prasoon & Himani wedding logo':'WeddingStay logo'} decoding="async"/>;
}
