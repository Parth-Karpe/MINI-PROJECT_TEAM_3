import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parsePublicationCsv, validatePublication, facultyIds, deriveResources } from "@/lib/publishedTimetable";
import { readPublication, savePublication } from "@/lib/publicationStore";
import { parseStaffCsv, mergeStaff } from "@/lib/staffRegistry";
import {identityFromCookie,provisionStaff,mapStudent} from '@/lib/localAuth';
import {workflowCall} from '@/lib/workflowBridge';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Local demo role selection, not production authentication.
export async function GET(req: Request) {
  try {
    const actor=identityFromCookie(req.headers.get('cookie')||'');if(!actor)return NextResponse.json({error:'Sign in first'},{status:401});
    const role = actor.role; const state = readPublication();
    const backend=await workflowCall(actor,'view');
    state.approved=backend.published?{...backend.approved_info,rows:backend.weekly_rows}:null;
    state.draft=backend.draft||null;
    if (role === "admin" || role === "hod") return NextResponse.json({ ...state, resources: deriveResources(state.approved?.rows || []), draftResources: deriveResources(state.draft?.rows || []) });
    if (role !== "faculty" && role !== "student") return NextResponse.json({ error: "Choose a demo role." }, { status: 400 });
    const rows = state.approved?.rows || [];
    const personalRows = rows;
    return NextResponse.json({ ...state, staff: undefined, resources: backend.resources.map((r:{id:string;type:string|null;capacity:number|null;building?:string})=>({...r,name:r.id})), draft: null, approved: state.approved ? { ...state.approved, rows: personalRows } : null,
      occupancy: backend.weekly_occupancy });
  } catch { return NextResponse.json({ error: "Could not read the saved timetable." }, { status: 500 }); }
}
export async function POST(req: Request) {
  try {
    const actor=identityFromCookie(req.headers.get('cookie')||'');if(!actor)return NextResponse.json({error:'Sign in first'},{status:401});
    const body = await req.json(); body.role=actor.role; const state = readPublication();
    if(body.action==='staff-provision'&&actor.role==='admin'){
      const record=state.staff?.find(r=>r.id===body.id);if(!record)throw new Error('Import the staff ID first');
      return NextResponse.json(provisionStaff(record.id,record.name,record.role));
    }
    if ((body.action === "staff-preview" || body.action === "staff-import") && body.role === "admin") {
      const records = parseStaffCsv(body.csv, body.staffRole);
      const merged = mergeStaff(state.staff || [], records);
      if (body.action === "staff-preview") return NextResponse.json({ records, totalAfterImport: merged.length });
      state.staff = merged;
    } else if (body.action === "upload" && body.role === "admin") {
      if (typeof body.csv !== "string" || body.csv.length > 2_000_000) throw new Error("Upload a CSV smaller than 2 MB.");
      const rows = parsePublicationCsv(body.csv);
      state.draft = { id: randomUUID(), filename: String(body.filename || "timetable.csv"), uploadedAt: new Date().toISOString(), rows, findings: validatePublication(rows) };
      await workflowCall(actor,'upload_draft',{draft:state.draft});
    } else if (body.action === "mapping" && body.role === "admin") {
      if (!/^[AB]$/.test(body.section) || ![`${body.section}1`, `${body.section}2`].includes(body.batch)) throw new Error("Choose section A/B and its matching batch 1/2.");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(body.facultyId)) throw new Error("Enter the faculty ID used in the CSV.");
      if (![1,3,5,7].includes(Number(body.semester || 5))) throw new Error("Choose semester 1, 3, 5 or 7.");
      state.studentSemester = Number(body.semester || 5); state.studentSection = body.section; state.studentBatch = body.batch; state.facultyId = body.facultyId.toUpperCase();
      mapStudent('PARTH',state.studentSemester,state.studentSection,state.studentBatch);
    } else if (body.action === "approve" && body.role === "hod") {
      state.draft=(await workflowCall(actor,'view')).draft||null;
      if (!state.draft || state.draft.id !== body.draftId) return NextResponse.json({ error: "The draft changed. Refresh and review it again." }, { status: 409 });
      const findings = validatePublication(state.draft.rows); if (findings.length) throw new Error("Resolve timetable conflicts before approval.");
      await workflowCall(actor,'publish',{publication:{...state.draft,approvedAt:new Date().toISOString()},term_start:body.termStart||'2026-09-07',term_end:body.termEnd||'2026-12-29'});
      state.approved = { ...state.draft, findings, approvedAt: new Date().toISOString() }; state.draft = null;
    } else return NextResponse.json({ error: "This action is unavailable for this demo role." }, { status: 403 });
    savePublication(state); return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 400 }); }
}
