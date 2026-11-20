import {NextResponse} from 'next/server';
import {authenticate,demoIdentity,identityFromCookie,signSession,type Identity} from '@/lib/localAuth';
import { hostedDemoLoginEnabled } from "@/lib/demoLogin";
export const runtime='nodejs';
const attempts=new Map<string,{count:number;until:number}>();
export async function GET(req:Request){const user=identityFromCookie(req.headers.get('cookie')||'');return NextResponse.json({user,mode:'local-review'},{status:user?200:401});}
function session(user: Identity, secure: boolean) {
 const response = NextResponse.json({ user });
 response.cookies.set("sc_session", signSession(user), { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: 28800 });
 return response;
}
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
 if (body && typeof body === "object" && Object.hasOwn(body, "demoRole")) {
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const localDemo = process.env.NODE_ENV === "development" && !!source &&
    localHosts.includes(source.hostname) && localHosts.includes(target.hostname);
  const previewDemo = !!source && source.protocol === "https:" && hostedDemoLoginEnabled();
  if (!localDemo && !previewDemo) {
   return NextResponse.json({ error: "Passwordless sign-in is available on the test site." }, { status: 403 });
  }
  const user = demoIdentity(body.demoRole, body.facultyId);
  return user ? session(user, target.protocol === "https:") :
   NextResponse.json({ error: "Choose a demo role and, for Faculty, a listed teacher." }, { status: 400 });
 }
 const id = String(body?.id || "").toUpperCase();
 const previous = attempts.get(id);
 if (previous && previous.until > Date.now() && previous.count >= 10) {
  return NextResponse.json({ error: "Too many attempts. Try again in 5 minutes." }, { status: 429 });
 }
 const user = authenticate(id, String(body?.password || ""));
 if (!user) {
  attempts.set(id, { count: (previous && previous.until > Date.now() ? previous.count : 0) + 1, until: Date.now() + 300000 });
  return NextResponse.json({ error: "Invalid ID or password." }, { status: 401 });
 }
 attempts.delete(id);
 return session(user, target.protocol === "https:");
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set('sc_session','',{httpOnly:true,path:'/',maxAge:0});return res;}
