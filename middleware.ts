import {NextResponse,type NextRequest} from 'next/server';
export async function middleware(req:NextRequest){
 const path=req.nextUrl.pathname;
 if(path.startsWith('/api/')&&req.method!=='GET'&&req.method!=='HEAD'){
  const origin=req.headers.get('origin');if(origin){let valid=false;try{const url=new URL(origin);valid=url.host.toLowerCase()===(req.headers.get('host')||req.nextUrl.host).toLowerCase()&&url.protocol===req.nextUrl.protocol;}catch{}if(!valid)return NextResponse.json({error:'Cross-origin mutation denied'},{status:403});}
 }
 const session=await fetch(new URL('/api/session',req.url),{headers:{cookie:req.headers.get('cookie')||''},cache:'no-store'}).catch(()=>null);
 const data=session?.ok?await session.json():null;const user=data?.user;
 if(!user)return path.startsWith('/api/')?NextResponse.json({error:'Sign in first.'},{status:401}):NextResponse.redirect(new URL('/login',req.url));
 if(path.startsWith('/dashboards/')&&path.split('/')[2]!==user.role)return NextResponse.redirect(new URL('/dashboards/'+user.role,req.url));
 const shared=['/api/publication','/api/workflow','/api/decision-preview'];
 if(path.startsWith('/api/')&&!shared.includes(path)&&user.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
 if(!path.startsWith('/api/')&&!path.startsWith('/dashboards/')&&path!=='/'&&user.role!=='admin')return NextResponse.redirect(new URL('/dashboards/'+user.role,req.url));
 return NextResponse.next();
}
export const config={matcher:['/((?!api/session|login|_next/static|_next/image|favicon.ico).*)']};
