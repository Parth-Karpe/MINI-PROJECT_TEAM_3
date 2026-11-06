import { NextResponse } from "next/server";
import { readPublication } from "@/lib/publicationStore";
import { forwardToEngine } from "@/lib/backend";
import { facultyIds, minutes, DAYS, deriveResources } from "@/lib/publishedTimetable";
import {identityFromCookie} from '@/lib/localAuth';
export const runtime="nodejs";
export async function POST(req: Request) {
  try {
    const body=await req.json();
    if(identityFromCookie(req.headers.get('cookie')||'')?.role!=="hod") return NextResponse.json({error:"HOD access required."},{status:403});
    const state=readPublication(); if(!state.approved) throw new Error("Approve a timetable first.");
    if(!DAYS.includes(body.day) || ![1,3,5,7].includes(Number(body.semester)) || !['A','B'].includes(body.section)) throw new Error("Invalid day or student mapping.");
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.end)) throw new Error("Choose HH:MM times.");
    const start=minutes(body.start)/60,end=minutes(body.end)/60;
    if(start<8||end>17||end<=start) throw new Error("Choose an interval within 08:00–17:00.");
    if(!deriveResources(state.approved.rows).some(r=>r.id===body.room)) throw new Error("Choose a resource from the approved CSV.");
    const bookings=state.approved.rows.filter(r=>r.day===body.day).map(r=>({id:r.entry_id,start:minutes(r.start_time)/60,end:minutes(r.end_time)/60,room_id:r.room_id,user_id:facultyIds(r)[0],faculty_ids:facultyIds(r),semester:r.semester,section:r.section,batch:r.batch}));
    const waited=Number(body.waitHours); if(!Number.isFinite(waited)||waited<0||waited>168) throw new Error("Wait must be between 0 and 168 hours.");
    // Clearly labeled synthetic requests: not real identities, requests or persisted allocations.
    const pending=[{id:"PREVIEW-OLDER",user_id:"Faculty A",faculty_ids:["PREVIEW-A"],created_at:-waited},{id:"PREVIEW-NEWER",user_id:"Faculty B",faculty_ids:["PREVIEW-B"],created_at:0}].map(r=>({...r,start,end,room_id:body.room,semester:String(body.semester),section:body.section,batch:"",base_priority:3}));
    const result=await forwardToEngine('/review/decision-preview',{method:'POST',body:JSON.stringify({bookings,pending,now:0,aging_rate:0.5,algorithm:body.algorithm==='greedy'?'greedy':'dp'})});
    return NextResponse.json(result.data,{status:result.status});
  } catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Preview failed"},{status:400});}
}
