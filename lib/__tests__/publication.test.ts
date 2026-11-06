import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PUBLICATION, parsePublicationCsv, validatePublication, type PublicationState } from "../publishedTimetable";
const memory = vi.hoisted(() => ({ state: null as PublicationState | null }));
vi.mock("../publicationStore", () => ({ readPublication: () => structuredClone(memory.state), savePublication: (state: PublicationState) => { memory.state = structuredClone(state); } }));
import { GET, POST } from "../../app/api/publication/route";
const header = "entry_id,day,start_time,end_time,branch,semester,section,batch,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students";
const csv = `${header}\nE1,Mon,09:00,10:00,CSE-AI,5,A,,DL,Deep Learning,theory,AK,Amit K,LHC306,0\nE2,Tue,09:00,11:00,CSE-AI,5,A,A2,DL,Deep Learning,lab,SV,Sneha V,LAB6,0`;
const post = (body: object) => POST(new Request("http://localhost/api/publication", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
beforeEach(() => { memory.state = structuredClone(EMPTY_PUBLICATION); });
describe("Static timetable publication", () => {
  it("keeps uploaded drafts invisible until approval and filters personal views", async () => {
    expect((await post({ role: "admin", action: "upload", csv })).status).toBe(200);
    let student = await (await GET(new Request("http://localhost/api/publication?role=student"))).json();
    expect(student.draft).toBeNull(); expect(student.approved).toBeNull();
    expect((await post({ role: "hod", action: "approve", draftId: memory.state!.draft!.id })).status).toBe(200);
    student = await (await GET(new Request("http://localhost/api/publication?role=student"))).json();
    expect(student.approved.rows.map((r: { entry_id: string }) => r.entry_id)).toEqual(["E1"]);
    expect(student.occupancy).toHaveLength(2);
    const faculty = await (await GET(new Request("http://localhost/api/publication?role=faculty"))).json();
    expect(faculty.approved.rows).toHaveLength(1);
  });
  it("blocks conflicts server-side even if the UI is bypassed", async () => {
    const conflict = csv + "\nE3,Mon,09:30,10:30,CSE-AI,5,A,,CC,Cloud Computing,theory,AK,Amit K,LHC306,0";
    await post({ role: "admin", action: "upload", csv: conflict });
    expect(memory.state!.draft!.findings).toHaveLength(3);
    expect((await post({ role: "hod", action: "approve", draftId: memory.state!.draft!.id })).status).toBe(400);
    expect(memory.state!.approved).toBeNull();
  });
  it("protects the approved version when a replacement draft is uploaded", async () => {
    await post({ role: "admin", action: "upload", csv });
    await post({ role: "hod", action: "approve", draftId: memory.state!.draft!.id });
    const approved = memory.state!.approved!.id;
    await post({ role: "admin", action: "upload", csv });
    expect(memory.state!.approved!.id).toBe(approved);
    expect((await post({ role: "hod", action: "approve", draftId: "stale-id" })).status).toBe(409);
  });
  it("limits mutations to the designated demo role", async () => {
    expect((await post({ role: "student", action: "upload", csv })).status).toBe(403);
    expect((await post({ role: "admin", action: "approve" })).status).toBe(403);
  });
  it("allows simultaneous independent lab batches and checks all co-teachers", () => {
    const rows = parsePublicationCsv(`${header}\nE1,Mon,09:00,11:00,CSE-AI,5,A,A1,DL,Deep Learning,lab,AK;SV,Amit and Sneha,LAB6,0\nE2,Mon,09:00,11:00,CSE-AI,5,A,A2,CNS,Network Security,lab,PS,Pooja,LHC201,0`);
    expect(validatePublication(rows)).toEqual([]);
    rows[1].faculty_id = "SV"; expect(validatePublication(rows)[0]).toContain("faculty overlaps");
  });
  it("rejects invalid dates, out-of-scope semesters and duplicate IDs", () => {
    expect(() => parsePublicationCsv(csv.replace("09:00", "25:00"))).toThrow("HH:MM");
    expect(() => parsePublicationCsv(csv.replace(",5,", ",3,"))).toThrow("semester 5");
    expect(() => parsePublicationCsv(csv.replace("E2,", "E1,"))).toThrow("Duplicate");
  });
  it("parses quoted names and matches semicolon-separated faculty IDs", async () => {
    const quoted = csv.replace("Amit K", '"Amit K, Faculty"').replace(",AK,", ",AK;SV,");
    expect(parsePublicationCsv(quoted)[0].faculty_name).toBe("Amit K, Faculty");
    await post({ role: "admin", action: "mapping", section: "B", batch: "B1", facultyId: "SV" });
    expect(memory.state!.studentSection).toBe("B"); expect(memory.state!.facultyId).toBe("SV");
  });
});
