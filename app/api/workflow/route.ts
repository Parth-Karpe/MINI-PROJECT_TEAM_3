import {NextResponse} from 'next/server';
import {identityFromCookie} from '@/lib/localAuth';
import {workflowCall} from '@/lib/workflowBridge';
export const runtime='nodejs';
export async function GET(req:Request){const actor=identityFromCookie(req.headers.get('cookie')||'');if(!actor)return NextResponse.json({error:'Sign in first'},{status:401});try{const url=new URL(req.url);return NextResponse.json(await workflowCall(actor,'view',Object.fromEntries(url.searchParams)));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Backend unavailable'},{status:503});}}
export async function POST(req:Request){const actor=identityFromCookie(req.headers.get('cookie')||'');if(!actor)return NextResponse.json({error:'Sign in first'},{status:401});try{const body=await req.json();return NextResponse.json(await workflowCall(actor,body.action,body.payload||{}));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Action failed'},{status:400});}}
