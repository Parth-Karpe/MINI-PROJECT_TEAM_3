// Edge-safe (no Node imports): used by middleware, the session API and the login page.
export const DEMO_FACULTY = [
  { id: "AK", name: "Amit K" },
  { id: "SV", name: "Sneha V" },
  { id: "DK", name: "Dheeraj K" },
  { id: "PS", name: "Pooja S" },
] as const;

/** Shared password for every staff login (faculty, HOD, admin). Students sign in with a USN only. */
export const STAFF_PASSWORD = "123";

export type StaffRole = "admin" | "hod" | "faculty";
export interface StaffAccount { id: string; name: string; role: StaffRole; facultyId?: string }

export const STAFF_ACCOUNTS: readonly StaffAccount[] = [
  { id: "ADMIN", name: "Department Admin", role: "admin" },
  { id: "HOD-CSAI", name: "Department HOD", role: "hod" },
  ...DEMO_FACULTY.map(f => ({ id: f.id, name: f.name, role: "faculty" as const, facultyId: f.id })),
];

/** Student USNs: 01FE24BCI followed by three digits, e.g. 01FE24BCI062. */
export const USN_PATTERN = /^01FE24BCI\d{3}$/;
export const normalizeUsn = (value: unknown) => String(value ?? "").trim().toUpperCase();
export const isUsn = (value: unknown) => USN_PATTERN.test(normalizeUsn(value));
export const KNOWN_STUDENTS: Record<string, string> = { "01FE24BCI062": "Parth Karpe" };
