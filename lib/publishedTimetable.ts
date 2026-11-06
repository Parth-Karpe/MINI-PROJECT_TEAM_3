export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DEMO_USERS = { admin: { name: "Department Admin", id: "ADMIN-DEMO" }, hod: { name: "HOD · CSE (AI)", id: "HOD-DEMO" }, faculty: { name: "Amit K", id: "AK" }, student: { name: "Parth Karpe", id: "STUDENT-DEMO" } };
export type Role = keyof typeof DEMO_USERS;
export interface PublishedSession {
  entry_id: string; day: string; start_time: string; end_time: string;
  branch: string; semester: string; section: string; batch: string;
  course_code: string; course_name: string; session_type: string;
  faculty_id: string; faculty_name: string; room_id: string; expected_students: number;
}
export interface Submission { id: string; filename: string; uploadedAt: string; rows: PublishedSession[]; findings: string[]; approvedAt?: string; }
export interface PublicationState { draft: Submission | null; approved: Submission | null; studentSection: string; studentBatch: string; facultyId: string; }
export const EMPTY_PUBLICATION: PublicationState = { draft: null, approved: null, studentSection: "A", studentBatch: "A1", facultyId: "AK" };
export function minutes(value: string): number { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
export function facultyIds(row: PublishedSession): string[] { return row.faculty_id.split(/[;,|]/).map(s => s.trim().toUpperCase()).filter(Boolean); }
function cells(text: string): string[][] {
  const result: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell.trim()); if (row.some(Boolean)) result.push(row); return result;
}
export function parsePublicationCsv(text: string): PublishedSession[] {
  const [headers, ...data] = cells(text);
  const required = ["entry_id", "day", "start_time", "end_time", "branch", "semester", "section", "course_code", "course_name", "session_type", "faculty_id", "faculty_name", "room_id"];
  if (!headers || required.some(h => !headers.includes(h))) throw new Error(`Required columns: ${required.join(", ")}. Optional: batch, expected_students.`);
  if (!data.length || data.length > 2000) throw new Error("Upload between 1 and 2000 sessions.");
  const ids = new Set<string>();
  return data.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index + 2}: column count differs from header.`);
    const r = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    for (const key of required) if (!r[key]) throw new Error(`Row ${index + 2}: ${key} is required.`);
    if (ids.has(r.entry_id)) throw new Error(`Duplicate entry_id: ${r.entry_id}`); ids.add(r.entry_id);
    const branch = r.branch.toUpperCase().replace(/[^A-Z]/g, "");
    if (!["CSEAI", "CSAI", "CSE"].includes(branch) || r.semester !== "5") throw new Error(`Row ${index + 2}: only semester 5 CSE (AI) is supported. Use branch CSE-AI; legacy CSE is accepted for demo files.`);
    if (!/^[AB]$/.test(r.section.toUpperCase())) throw new Error(`Row ${index + 2}: section must be A or B.`);
    if (r.batch && ![`${r.section.toUpperCase()}1`, `${r.section.toUpperCase()}2`].includes(r.batch.toUpperCase())) throw new Error(`Row ${index + 2}: batch must match section (A1/A2 or B1/B2).`);
    if (!DAYS.includes(r.day)) throw new Error(`Row ${index + 2}: use Mon, Tue, Wed, Thu, Fri or Sat.`);
    for (const key of ["start_time", "end_time"]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r[key])) throw new Error(`Row ${index + 2}: ${key} must be 24-hour HH:MM.`);
    if (minutes(r.end_time) <= minutes(r.start_time)) throw new Error(`Row ${index + 2}: end must follow start.`);
    if (minutes(r.start_time) < 480 || minutes(r.end_time) > 1020) throw new Error(`Row ${index + 2}: sessions must be within 08:00–17:00.`);
    if (!["theory", "tutorial", "lab", "project"].includes(r.session_type)) throw new Error(`Row ${index + 2}: invalid session_type.`);
    const count = Number(r.expected_students || 0); if (!Number.isInteger(count) || count < 0) throw new Error(`Row ${index + 2}: invalid student count.`);
    return { ...r, branch: "CSE-AI", section: r.section.toUpperCase(), batch: (r.batch || "").toUpperCase(), expected_students: count } as unknown as PublishedSession;
  });
}
export function validatePublication(rows: PublishedSession[]): string[] {
  const findings: string[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.day !== b.day || minutes(a.start_time) >= minutes(b.end_time) || minutes(b.start_time) >= minutes(a.end_time)) continue;
    const prefix = `${a.entry_id} / ${b.entry_id} (${a.day})`;
    if (a.room_id.toUpperCase() === b.room_id.toUpperCase()) findings.push(`${prefix}: room ${a.room_id} overlaps.`);
    if (facultyIds(a).some(id => facultyIds(b).includes(id))) findings.push(`${prefix}: faculty overlaps.`);
    if (a.section === b.section && (!a.batch || !b.batch || a.batch === b.batch)) findings.push(`${prefix}: section/batch overlaps.`);
  } return findings;
}
