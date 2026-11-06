import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parsePublicationCsv, validatePublication, facultyIds } from "@/lib/publishedTimetable";
import { readPublication, savePublication } from "@/lib/publicationStore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Local demo role selection, not production authentication.
export async function GET(req: Request) {
  try {
    const role = new URL(req.url).searchParams.get("role"); const state = readPublication();
    if (role === "admin" || role === "hod") return NextResponse.json(state);
    if (role !== "faculty" && role !== "student") return NextResponse.json({ error: "Choose a demo role." }, { status: 400 });
    const rows = state.approved?.rows || [];
    const personalRows = role === "faculty" ? rows.filter(r => facultyIds(r).includes(state.facultyId.toUpperCase())) : rows.filter(r => r.section === state.studentSection && (!r.batch || r.batch === state.studentBatch));
    return NextResponse.json({ ...state, draft: null, approved: state.approved ? { ...state.approved, rows: personalRows } : null,
      occupancy: rows.map(r => ({ day: r.day, start_time: r.start_time, end_time: r.end_time, room_id: r.room_id, session_type: r.session_type })) });
  } catch { return NextResponse.json({ error: "Could not read the saved timetable." }, { status: 500 }); }
}
export async function POST(req: Request) {
  try {
    const body = await req.json(); const state = readPublication();
    if (body.action === "upload" && body.role === "admin") {
      if (typeof body.csv !== "string" || body.csv.length > 2_000_000) throw new Error("Upload a CSV smaller than 2 MB.");
      const rows = parsePublicationCsv(body.csv);
      state.draft = { id: randomUUID(), filename: String(body.filename || "timetable.csv"), uploadedAt: new Date().toISOString(), rows, findings: validatePublication(rows) };
    } else if (body.action === "mapping" && body.role === "admin") {
      if (!/^[AB]$/.test(body.section) || ![`${body.section}1`, `${body.section}2`].includes(body.batch)) throw new Error("Choose section A/B and its matching batch 1/2.");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(body.facultyId)) throw new Error("Enter the faculty ID used in the CSV.");
      state.studentSection = body.section; state.studentBatch = body.batch; state.facultyId = body.facultyId.toUpperCase();
    } else if (body.action === "approve" && body.role === "hod") {
      if (!state.draft || state.draft.id !== body.draftId) return NextResponse.json({ error: "The draft changed. Refresh and review it again." }, { status: 409 });
      const findings = validatePublication(state.draft.rows); if (findings.length) throw new Error("Resolve timetable conflicts before approval.");
      state.approved = { ...state.draft, findings, approvedAt: new Date().toISOString() }; state.draft = null;
    } else return NextResponse.json({ error: "This action is unavailable for this demo role." }, { status: 403 });
    savePublication(state); return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 400 }); }
}
