import {NextResponse} from 'next/server';
import {authenticateStaff,identityFromCookie,signSession,studentIdentity,type Identity} from '@/lib/localAuth';
export const runtime='nodejs';
export async function GET(req:Request){const user=identityFromCookie(req.headers.get('cookie')||'');return NextResponse.json({user,mode:'demo'},{status:user?200:401});}
function session(user: Identity, secure: boolean) {
 const response = NextResponse.json({ user });
 response.cookies.set("sc_session", signSession(user), { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: 28800 });
 return response;
}
// Demo sign-in: students enter a USN (no password); faculty, HOD and admin use the shared password.
export async function POST(req: Request) {
 const target = new URL(req.url);
 const origin = req.headers.get("origin");
 const host = req.headers.get("host") || target.host;
 let source: URL | undefined;
 try {
  if (origin) source = new URL(origin);
 } catch {
  return NextResponse.json({ error: "Invalid sign-in origin." }, { status: 403 });
 }
 if (source && (source.host !== host || source.protocol !== target.protocol)) {
  return NextResponse.json({ error: "Cross-origin sign-in denied." }, { status: 403 });
 }
 const body = await req.json().catch(() => null);
 const secure = target.protocol === "https:";
 if (body?.role === "student") {
  const user = studentIdentity(body.usn);
  return user ? session(user, secure) : NextResponse.json({ error: "Enter a valid USN, for example 01FE24BCI062." }, { status: 401 });
 }
 const user = authenticateStaff(body?.role, body?.id, body?.password);
 return user ? session(user, secure) : NextResponse.json({ error: "Wrong password." }, { status: 401 });
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set('sc_session','',{httpOnly:true,path:'/',maxAge:0});return res;}
