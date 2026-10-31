/**
 * Server-only data-access facade for the Smart Campus engine.
 *
 * Every function below forwards a request to the Python Algorithm Engine
 * microservice (FastAPI app in `api/main.py`) through the server-side bridge
 * in `lib/backend.ts`. Pages (Server Components) and Route Handlers both go
 * through here, so the engine is only ever contacted from server context.
 *
 * The engine itself stays a separate Python runtime on purpose -- the
 * allocation pipeline (balanced AVL interval tree, weighted-interval
 * scheduling DP, priority aging) is implemented in Python and is not being
 * re-implemented in TypeScript during this migration.
 */
import "server-only";

import { forwardToEngine } from "@/lib/backend";
import type {
  AnalysisReport,
  AuditResponse,
  EngineState,
  NotificationResponse,
  RecommendationResponse,
  Resource,
  ResourceRegistration,
  TimetableEntryRegistration,
  TimetableState,
} from "@/lib/types";
import { timetableStore } from "@/lib/timetableStore";

export type AdminStateQuery = {
  window_start?: string;
  window_end?: string;
  now?: string;
};

export type AvailabilityQuery = {
  start: string;
  end: string;
  min_capacity?: number;
  resource_type?: string;
  near_location?: string;
};

export type RecommendationQuery = {
  resource_type: string;
  duration_hours: number;
  min_capacity: number;
  user_id: string;
  priority: number;
  horizon_start: string;
  horizon_end: string;
  top_n?: number;
};

export type ReportQuery = {
  window_start: string;
  window_end: string;
};

export type AuditQuery = {
  resource_id?: string;
  request_id?: string;
  user_id?: string;
};

function toQuery(params: { [key: string]: string | number | undefined }): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

// ---- health -----------------------------------------------------------------

export function getEngineHealth() {
  return forwardToEngine<{ status: string }>("/health");
}

// ---- fallbacks used when the engine is not reachable yet ----------------------

export const EMPTY_ENGINE_STATE: EngineState = {
  resources: [],
  accepted: [],
  pending: [],
  rejected: [],
  timetable_finalized: false,
  timetable_locked_count: 0,
  accepted_total_count: 0,
};

export const EMPTY_TIMETABLE: TimetableState = {
  finalized: false,
  template_row_count: 0,
  locked_occurrence_count: 0,
  horizon: null,
  entries: [],
};


// ---- admin state / resources / timetable -----------------------------------

export async function getAdminState(query: AdminStateQuery = {}) {
  const res = await forwardToEngine<EngineState>("/admin/state", {
    query: toQuery({ ...query }),
  });
  if (res.status === 503) {
    return { status: 200, data: timetableStore.getAdminState() as unknown as EngineState };
  }
  return res;
}

export async function getEngineResources(): Promise<{ status: number; data: { resources: Resource[] } }> {
  const res = await forwardToEngine<{ resources: Resource[] }>("/resources");
  if (res.status === 503) {
    const adminState = timetableStore.getAdminState();
    return { status: 200, data: { resources: adminState.resources } };
  }
  return res;
}

export function registerResources(resources: ResourceRegistration[]) {
  return forwardToEngine<{ status: string; resource_count: number }>("/resources", {
    method: "POST",
    body: JSON.stringify(resources),
  });
}

export function importRooms(csv_text: string) {
  return forwardToEngine<{ status: string; resource_count: number }>("/import/rooms", {
    method: "POST",
    body: JSON.stringify({ csv_text }),
  });
}

export function importReference(payload: {
  sections_csv?: string | null;
  faculty_csv?: string | null;
  courses_csv?: string | null;
}) {
  return forwardToEngine<{ sections: number; faculty: number; courses: number }>(
    "/import/reference",
    {
      method: "POST",
      body: JSON.stringify({
        sections_csv: payload.sections_csv,
        faculty_csv: payload.faculty_csv,
        courses_csv: payload.courses_csv,
      }),
    }
  );
}

export function submitTimetable(entries: TimetableEntryRegistration[], now?: string) {
  return forwardToEngine<{ results: Array<{ entry_id: string; status: string }> }>("/timetable", {
    method: "POST",
    body: JSON.stringify(entries),
    ...(now ? { query: { now } } : {}),
  });
}

export async function getTimetable() {
  const res = await forwardToEngine<TimetableState>("/timetable");
  if (res.status === 503) {
    return { status: 200, data: timetableStore.getTimetableState() as unknown as TimetableState };
  }
  return res;
}

export function analyzeTimetable(csv_text: string) {
  return forwardToEngine<AnalysisReport>("/timetable/analyze", {
    method: "POST",
    body: JSON.stringify({ csv_text }),
  });
}

export function finalizeTimetable(body: {
  csv_text: string;
  actor_id: string;
  actor_role: string;
  week_start: string;
  weeks?: number;
  replace?: boolean;
  now?: string;
}) {
  return forwardToEngine<Record<string, unknown>>("/timetable/finalize", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- availability / recommendations / dashboards -----------------------------

export function getAvailability(query: AvailabilityQuery) {
  return forwardToEngine<Record<string, unknown>>("/availability", { query: toQuery(query) });
}

export function getResourceStatus(resource_id: string, start: string, end: string) {
  return forwardToEngine<Record<string, unknown>>(`/status/${encodeURIComponent(resource_id)}`, {
    query: toQuery({ start, end }),
  });
}

export function getRecommendations(query: RecommendationQuery) {
  return forwardToEngine<RecommendationResponse>("/recommendations", { query: toQuery(query) });
}

export function getStudentDashboard(user_id: string) {
  return forwardToEngine<Record<string, unknown>>(`/dashboard/student/${encodeURIComponent(user_id)}`);
}

export function getFacultyDashboard(user_id: string) {
  return forwardToEngine<Record<string, unknown>>(`/dashboard/faculty/${encodeURIComponent(user_id)}`);
}

export function getHodDashboard(department: string, window_start: string, window_end: string) {
  return forwardToEngine<Record<string, unknown>>(`/dashboard/hod/${encodeURIComponent(department)}`, {
    query: toQuery({ window_start, window_end }),
  });
}

// ---- bookings lifecycle ------------------------------------------------------

export function submitRequest(body: Record<string, unknown>, idempotency_key?: string) {
  const headers: Record<string, string> = {};
  if (idempotency_key) headers["Idempotency-Key"] = idempotency_key;
  return forwardToEngine<Record<string, unknown>>("/requests", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function resolveDue(now?: string) {
  const res = await forwardToEngine<Record<string, unknown>>("/admin/resolve", {
    method: "POST",
    body: JSON.stringify({ now: now ?? null }),
  });
  if (res.status === 503) {
    return { status: 200, data: { status: "ok", resolved: 0, pending: 0 } };
  }
  return res;
}

export function cancelBooking(request_id: string, now?: string) {
  return forwardToEngine<Record<string, unknown>>("/cancel", {
    method: "POST",
    body: JSON.stringify({ request_id, now: now ?? null }),
  });
}

export function waitlistPosition(resource_id: string, request_id: string, start: string, end: string) {
  return forwardToEngine<Record<string, unknown>>(`/waitlist/${encodeURIComponent(resource_id)}`, {
    query: toQuery({ request_id, start, end }),
  });
}

// ---- notifications / audit / report / reset ---------------------------------

export function getNotifications(user_id: string) {
  return forwardToEngine<NotificationResponse>(`/notifications/${encodeURIComponent(user_id)}`);
}

export function getAudit(query: AuditQuery = {}) {
  return forwardToEngine<AuditResponse>("/audit", { query: toQuery(query) });
}

export function getReport(query: ReportQuery) {
  return forwardToEngine<Record<string, unknown>>("/report", { query: toQuery(query) });
}

export function resetEngine() {
  return forwardToEngine<{ status: string }>("/reset", { method: "POST", body: JSON.stringify({}) });
}
