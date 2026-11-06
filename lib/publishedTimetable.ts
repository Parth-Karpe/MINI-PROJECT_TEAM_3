export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DEMO_USERS = { admin: { name: "Department Admin", id: "ADMIN-DEMO" }, hod: { name: "HOD · CSE (AI)", id: "HOD-DEMO" }, faculty: { name: "Amit K", id: "AK" }, student: { name: "Parth Karpe", id: "STUDENT-DEMO" } };
export type Role = keyof typeof DEMO_USERS;
export interface PublishedSession {
  entry_id: string; day: string; start_time: string; end_time: string;
  branch: string; semester: string; section: string; batch: string;
  course_code: string; course_name: string; session_type: string;
  faculty_id: string; faculty_name: string; room_id: string; expected_students: number;
  _one_off_date?: string; room_name?: string; room_type?: string; room_capacity?: number; building?: string;
}
export interface Submission { id: string; filename: string; uploadedAt: string; rows: PublishedSession[]; findings: string[]; approvedAt?: string; }
export interface PublicationState { draft: Submission | null; approved: Submission | null; studentSemester?: number; studentSection: string; studentBatch: string; facultyId: string; staff?: import("./staffRegistry").StaffRecord[]; }
export const EMPTY_PUBLICATION: PublicationState = { draft: null, approved: null, studentSemester: 5, studentSection: "A", studentBatch: "A1", facultyId: "AK" };
export function minutes(value: string): number { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
export function facultyIds(row: PublishedSession): string[] { return row.faculty_id.split(/[;,|]/).map(s => s.trim().toUpperCase()).filter(Boolean); }
export function cells(text: string): string[][] {
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
    if (!["CSEAI", "CSAI", "CSE"].includes(branch) || !["1", "3", "5", "7"].includes(r.semester)) throw new Error(`Row ${index + 2}: only semesters 1, 3, 5 and 7 CSE (AI) are supported. Use branch CSE-AI; legacy CSE is accepted for demo files.`);
    if (!/^[AB]$/.test(r.section.toUpperCase())) throw new Error(`Row ${index + 2}: section must be A or B.`);
    if (r.batch && ![`${r.section.toUpperCase()}1`, `${r.section.toUpperCase()}2`].includes(r.batch.toUpperCase())) throw new Error(`Row ${index + 2}: batch must match section (A1/A2 or B1/B2).`);
    if (!DAYS.includes(r.day)) throw new Error(`Row ${index + 2}: use Mon, Tue, Wed, Thu, Fri or Sat.`);
    for (const key of ["start_time", "end_time"]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r[key])) throw new Error(`Row ${index + 2}: ${key} must be 24-hour HH:MM.`);
    if (minutes(r.end_time) <= minutes(r.start_time)) throw new Error(`Row ${index + 2}: end must follow start.`);
    if (minutes(r.start_time) < 480 || minutes(r.end_time) > 1020) throw new Error(`Row ${index + 2}: sessions must be within 08:00–17:00.`);
    if (!["theory", "tutorial", "lab", "project"].includes(r.session_type)) throw new Error(`Row ${index + 2}: invalid session_type.`);
    const count = Number(r.expected_students || 0); if (!Number.isInteger(count) || count < 0) throw new Error(`Row ${index + 2}: invalid student count.`);
    const roomCapacity = r.room_capacity ? Number(r.room_capacity) : undefined;
    if (roomCapacity !== undefined && (!Number.isInteger(roomCapacity) || roomCapacity <= 0)) throw new Error(`Row ${index + 2}: room_capacity must be a positive integer.`);
    if (r.room_type && !["classroom","lab","hall","meeting_room","workstation","equipment"].includes(r.room_type)) throw new Error(`Row ${index + 2}: invalid room_type.`);
    return { ...r, branch: "CSE-AI", section: r.section.toUpperCase(), batch: (r.batch || "").toUpperCase(), room_id: r.room_id.toUpperCase(), room_capacity: roomCapacity, expected_students: count } as unknown as PublishedSession;
  });
}
export function validatePublication(rows: PublishedSession[]): string[] {
  const findings: string[] = [];
  const resources = deriveResources(rows);
  for (const resource of resources) {
    for (const field of ["room_type", "room_capacity", "building"] as const) {
      const values = new Set(rows.filter(r => r.room_id === resource.id).map(r => r[field]).filter(v => v !== undefined && v !== ""));
      if (values.size > 1) findings.push(`Resource ${resource.id}: inconsistent ${field} values in CSV.`);
    }
  }
  for (const row of rows) {
    const resource = resources.find(r => r.id === row.room_id)!;
    if (resource.capacity && row.expected_students > resource.capacity) findings.push(`${row.entry_id}: ${row.expected_students} students exceed ${resource.id} capacity ${resource.capacity}.`);
    if (row.session_type === "lab" && resource.type && resource.type !== "lab") findings.push(`${row.entry_id}: lab session requires a lab resource.`);
  }
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.day !== b.day || minutes(a.start_time) >= minutes(b.end_time) || minutes(b.start_time) >= minutes(a.end_time)) continue;
    const prefix = `${a.entry_id} / ${b.entry_id} (${a.day})`;
    if (a.room_id.toUpperCase() === b.room_id.toUpperCase()) findings.push(`${prefix}: room ${a.room_id} overlaps.`);
    if (facultyIds(a).some(id => facultyIds(b).includes(id))) findings.push(`${prefix}: faculty overlaps.`);
    if (a.semester === b.semester && a.section === b.section && (!a.batch || !b.batch || a.batch === b.batch)) findings.push(`${prefix}: section/batch overlaps.`);
  } return findings;
}

export interface CsvResource { id: string; name: string; type: string | null; capacity: number | null; building: string | null; }
export function deriveResources(rows: PublishedSession[]): CsvResource[] {
  return [...new Set(rows.map(r => r.room_id))].sort().map(id => {
    const matches = rows.filter(r => r.room_id === id);
    return { id, name: matches.find(r => r.room_name)?.room_name || id, type: matches.find(r => r.room_type)?.room_type || null,
      capacity: matches.find(r => r.room_capacity)?.room_capacity || null, building: matches.find(r => r.building)?.building || null };
  });
}
