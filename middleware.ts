import { hostedSessionRole } from './lib/hostedSession';
import {NextResponse,type NextRequest} from 'next/server';
export async function middleware(req:NextRequest){
 const path=req.nextUrl.pathname;
 if(path.startsWith('/api/')&&req.method!=='GET'&&req.method!=='HEAD'){
  const origin=req.headers.get('origin');if(origin){let valid=false;try{const url=new URL(origin);valid=url.host.toLowerCase()===(req.headers.get('host')||req.nextUrl.host).toLowerCase()&&url.protocol===req.nextUrl.protocol;}catch{}if(!valid)return NextResponse.json({error:'Cross-origin mutation denied'},{status:403});}
 }
 const hostedConfig = process.env.CAMPUS_AUTH_CONFIG_JSON;
 let role = hostedConfig ? await hostedSessionRole(req, hostedConfig) : null;
 if (!hostedConfig && !process.env.VERCEL) {
  try {
   const session = await fetch(new URL('/api/session', req.url), { headers: {cookie:req.headers.get('cookie') || ''}, cache:'no-store' });
   if (session.ok) role = (await session.json()).user?.role ?? null;
  } catch {
   role = null;
  }
 }
 if(!role)return path.startsWith('/api/')?NextResponse.json({error:'Sign in first.'},{status:401}):NextResponse.redirect(new URL('/login',req.url));
 if(path.startsWith('/dashboards/')&&path.split('/')[2]!==role)return NextResponse.redirect(new URL('/dashboards/'+role,req.url));
 const shared=['/api/publication','/api/workflow','/api/decision-preview'];
 if(path.startsWith('/api/')&&!shared.includes(path)&&role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
 if(!path.startsWith('/api/')&&!path.startsWith('/dashboards/')&&path!=='/'&&role!=='admin')return NextResponse.redirect(new URL('/dashboards/'+role,req.url));
 return NextResponse.next();
}
export const config={matcher:['/((?!api/session|login|_next/static|_next/image|favicon.ico).*)']};
