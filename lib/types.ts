/**
 * Shared TypeScript types mirroring the JSON contracts served by the
 * Python Algorithm Engine microservice (api/main.py) and returned through
 * the Next.js Route Handlers.
 *
 * Time fields that the engine stores as hours-since-epoch come back over
 * the wire as ISO datetime strings; UI-facing shapes use ISO strings too.
 */

export interface Resource {
  resource_id: string;
  name: string;
  resource_type: string;
  capacity: number;
  threshold_hours?: number;
  location?: string;
  department?: string;
  exclusive_use?: boolean;
  locked_slots?: number;
}

export interface AcceptedBooking {
  request_id: string;
  user_id: string;
  resource_id: string;
  resource_type?: string;
  start: string; // ISO string
  end: string; // ISO string
  priority?: number;
  group_size?: number;
  status?: string;
  is_timetable?: boolean;
}

export interface PendingRequest {
  request_id: string;
  user_id: string;
  resource_id: string;
  resource_type?: string;
  start: string;
  end: string;
  role?: string;
  priority?: number;
  group_size?: number;
  decide_at?: string;
  score?: number;
  created_at?: string;
}

export interface RejectedRequest {
  request_id: string;
  user_id: string;
  resource_id: string;
  start: string;
  end: string;
  priority?: number;
  group_size?: number;
  reason?: string;
  rejected_at?: string;
}

export interface TimetableEntry {
  entry_id: string;
  resource_id: string;
  day: string;
  start_time: string;
  end_time: string;
  course_code?: string;
  course_name?: string;
  section_id?: string;
  faculty_id?: string;
  faculty_name?: string;
}

export interface TimetableState {
  finalized: boolean;
  template_row_count: number;
  locked_occurrence_count?: number;
  horizon?: {
    start: string;
    end: string;
    weeks: number;
  } | null;
  entries: TimetableEntry[];
}

export interface EngineState {
  resources: Resource[];
  accepted: AcceptedBooking[];
  pending: PendingRequest[];
  rejected: RejectedRequest[];
  timetable_finalized: boolean;
  timetable_locked_count: number;
  accepted_total_count: number;
}

export interface Flaw {
  kind: string;
  severity: "hard_conflict" | "capacity" | "load_balance" | "advisory" | string;
  entries: string[];
  message: string;
  suggestion?: string;
}

export interface AnalysisReport {
  clean: boolean;
  summary: string;
  flaw_count: number;
  entries_analyzed: number;
  flaws: Flaw[];
}

export interface AuditEntry {
  ts?: string;
  event_type: string;
  request_id?: string;
  resource_id?: string;
  user_id?: string;
  details?: Record<string, unknown>;
}

export interface AuditResponse {
  entries: AuditEntry[];
}

export interface NotificationMessage {
  user_id?: string;
  message?: string;
  request_id?: string;
  resource_id?: string;
  [key: string]: unknown;
}

export interface NotificationResponse {
  user_id: string;
  messages: NotificationMessage[];
}

export interface Recommendation {
  request_id?: string;
  resource_id?: string;
  start?: string;
  end?: string;
  [key: string]: unknown;
}

export interface RecommendationResponse {
  recommendations: Recommendation[];
}

export interface ResourceRegistration {
  resource_id: string;
  name: string;
  resource_type: string;
  capacity: number;
  threshold_hours?: number;
  location?: string;
  department?: string;
  exclusive_use?: boolean;
}

export interface TimetableEntryRegistration {
  entry_id: string;
  owner_id: string;
  resource_id: string;
  resource_type: string;
  start: string;
  end: string;
  role?: string;
  group_size?: number;
}

export interface TimetableFinalizeRequest {
  csv_text: string;
  actor_id: string;
  actor_role: string;
  week_start: string;
  weeks?: number;
  replace?: boolean;
  now?: string;
}

export interface ManualOverrideRequest {
  request_id: string;
  user_id: string;
  resource_id: string;
  resource_type: string;
  start: string;
  end: string;
  group_size?: number;
  actor_id: string;
  actor_role: string;
  reason: string;
  now?: string;
}

export interface RequestSubmission {
  request_id: string;
  user_id: string;
  resource_id: string;
  resource_type: string;
  start: string;
  end: string;
  role?: string | null;
  priority?: number | null;
  group_size?: number;
  now?: string;
}
