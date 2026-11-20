import { cells } from "./publishedTimetable";
export type StaffRole = "faculty" | "hod";
export interface StaffRecord { id: string; name: string; role: StaffRole; }
export function parseStaffCsv(csv: string, role: StaffRole): StaffRecord[] {
  if (role !== "faculty" && role !== "hod") throw new Error("Choose faculty or HOD.");
  if (typeof csv !== "string" || csv.length > 500_000) throw new Error("Staff CSV must be smaller than 500 KB.");
  const [rawHeaders, ...rows] = cells(csv);
  const headers = rawHeaders?.map(h => h.toLowerCase());
  const idColumn = headers?.findIndex(h => h === "id" || h === `${role}_id`);
  if (idColumn === undefined || idColumn < 0) throw new Error(`Include an id or ${role}_id header. Name is optional.`);
  if (!rows.length || rows.length > 1000) throw new Error("Include 1–1000 staff records.");
  const nameColumn = headers.indexOf("name"); const seen = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Row ${index+2}: incorrect column count.`);
    const id = row[idColumn].toUpperCase();
    if (!/^[A-Z0-9_-]{1,40}$/.test(id)) throw new Error(`Row ${index+2}: invalid staff ID.`);
    if (seen.has(id)) throw new Error(`Duplicate staff ID: ${id}`); seen.add(id);
    const name = nameColumn >= 0 ? row[nameColumn] : "";
    if (name.length > 120) throw new Error(`Row ${index+2}: name is too long.`);
    return { id, name: name || id, role };
  });
}
export function mergeStaff(existing: StaffRecord[], incoming: StaffRecord[]): StaffRecord[] {
  const map = new Map(existing.map(r => [r.id, r]));
  for (const record of incoming) {
    const old = map.get(record.id);
    if (old && old.role !== record.role) throw new Error(`ID ${record.id} is already registered as ${old.role}. This import cannot change roles.`);
    map.set(record.id, { ...record, name: record.name === record.id && old ? old.name : record.name });
  }
  return [...map.values()].sort((a,b) => a.id.localeCompare(b.id));
}
