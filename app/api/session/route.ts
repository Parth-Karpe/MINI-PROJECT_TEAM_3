import {NextResponse} from 'next/server';
import {authenticate,identityFromCookie,signSession} from '@/lib/localAuth';
export const runtime='nodejs';
const attempts=new Map<string,{count:number;until:number}>();
export async function GET(req:Request){const user=identityFromCookie(req.headers.get('cookie')||'');return NextResponse.json({user,mode:'local-review'},{status:user?200:401});}
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin){const target=new URL(req.url);const source=new URL(origin);if(source.host!==(req.headers.get('host')||target.host)||source.protocol!==target.protocol)return NextResponse.json({error:'Cross-origin sign-in denied'},{status:403});}
 const body=await req.json().catch(()=>({}));const id=String(body.id||'').toUpperCase();const previous=attempts.get(id);if(previous&&previous.until>Date.now()&&previous.count>=10)return NextResponse.json({error:'Too many attempts. Try again in 5 minutes.'},{status:429});
 const user=authenticate(id,String(body.password||''));if(!user){attempts.set(id,{count:(previous&&previous.until>Date.now()?previous.count:0)+1,until:Date.now()+300000});return NextResponse.json({error:'Invalid ID or password.'},{status:401});}attempts.delete(id);
 const res=NextResponse.json({user});res.cookies.set('sc_session',signSession(user),{httpOnly:true,sameSite:'strict',secure:new URL(req.url).protocol==='https:',path:'/',maxAge:28800});return res;
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set('sc_session','',{httpOnly:true,path:'/',maxAge:0});return res;}
