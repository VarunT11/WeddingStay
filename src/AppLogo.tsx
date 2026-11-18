type Props={variant?:'full'|'compact';className?:string;decorative?:boolean};
export function AppLogo({variant='compact',className='',decorative=false}:Props){
 const full=variant==='full';
 return <img className={`app-logo app-logo-${variant} ${className}`} src={import.meta.env.BASE_URL+(full?'wedding-logo.jpeg':'ph-monogram.png')} width={full?1254:512} height={full?1254:512} alt={decorative?'':'Prasoon & Himani wedding logo'} decoding="async"/>;
}
