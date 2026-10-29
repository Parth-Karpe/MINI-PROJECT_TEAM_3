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
  end: string;   // ISO string
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
