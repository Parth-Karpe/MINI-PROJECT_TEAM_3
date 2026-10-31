import { NextResponse } from "next/server";
import { timetableStore } from "@/lib/timetableStore";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const filterBatch = url.searchParams.get("batch");
    const filterTeacher = url.searchParams.get("teacher");
    const filterRoom = url.searchParams.get("room");

    const activeVersion = timetableStore.getActiveVersion();
    if (!activeVersion) {
      return NextResponse.json({ error: "No active timetable version" }, { status: 404 });
    }

    let sessions = timetableStore.getSessions(activeVersion.id);

    if (filterBatch) sessions = sessions.filter((s) => s.section_id === filterBatch);
    if (filterTeacher) sessions = sessions.filter((s) => s.teacher_id === filterTeacher || s.teacher_name === filterTeacher);
    if (filterRoom) sessions = sessions.filter((s) => s.room_id === filterRoom);

    if (format === "json") {
      return NextResponse.json({
        version: activeVersion,
        sessions,
      });
    }

    // Default CSV
    const headers = "entry_id,day,start_time,end_time,branch,semester,section,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students\n";
    const rows = sessions.map((s, idx) => {
      const entryId = `E${String(idx + 1).padStart(3, "0")}`;
      const branch = s.section_id.split("-")[0] || "CSE";
      const semester = s.section_id.split("-")[1] || "3";
      const section = s.section_id.split("-")[2] || "A";
      const expected = s.session_type === "lab" ? 30 : 60;
      return `${entryId},${s.day_of_week},${s.start_time},${s.end_time},${branch},${semester},${section},${s.course_code},"${s.course_name}",${s.session_type},${s.teacher_id},"${s.teacher_name || ""}",${s.room_id},${expected}`;
    }).join("\n");

    const csvContent = headers + rows;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="timetable_${activeVersion.version_number}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
