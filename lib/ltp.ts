/**
 * L-T-P (Lecture-Tutorial-Practical) calculation and session expansion utilities.
 *
 * Mathematical rules:
 * - L (Lecture): Theory sessions/week, usually 1.0 hour each.
 * - T (Tutorial): Interactive problem-solving sessions/week, configurable duration.
 * - P (Practical): Laboratory sessions/week, configurable multi-hour block (e.g. 2h or 3h).
 *
 * Weekly Teaching Hours = (L * d_L) + (T * d_T) + (P * d_P)
 * Note: Credits are stored independently and do NOT dictate contact hours.
 */

export interface LTPParams {
  lecture_count: number;
  lecture_duration: number;
  tutorial_count: number;
  tutorial_duration: number;
  practical_count: number;
  practical_duration: number;
}

export interface ExpandedSessionSlot {
  session_type: "theory" | "tutorial" | "lab";
  session_number: number;
  duration_hours: number;
}

/**
 * Calculates total weekly teaching hours from L-T-P parameters.
 */
export function calculateWeeklyTeachingHours(params: LTPParams): number {
  const lHours = (params.lecture_count || 0) * (params.lecture_duration || 1.0);
  const tHours = (params.tutorial_count || 0) * (params.tutorial_duration || 1.0);
  const pHours = (params.practical_count || 0) * (params.practical_duration || 2.0);
  return Number((lHours + tHours + pHours).toFixed(2));
}

/**
 * Expands course L-T-P specifications into a list of discrete session slots
 * that the timetable scheduler must place across the week.
 */
export function expandLTPSessions(params: LTPParams): ExpandedSessionSlot[] {
  const sessions: ExpandedSessionSlot[] = [];

  // 1. Expand Theory (Lecture) sessions
  for (let i = 1; i <= (params.lecture_count || 0); i++) {
    sessions.push({
      session_type: "theory",
      session_number: i,
      duration_hours: params.lecture_duration || 1.0,
    });
  }

  // 2. Expand Tutorial sessions
  for (let i = 1; i <= (params.tutorial_count || 0); i++) {
    sessions.push({
      session_type: "tutorial",
      session_number: i,
      duration_hours: params.tutorial_duration || 1.0,
    });
  }

  // 3. Expand Practical (Lab) sessions
  for (let i = 1; i <= (params.practical_count || 0); i++) {
    sessions.push({
      session_type: "lab",
      session_number: i,
      duration_hours: params.practical_duration || 2.0,
    });
  }

  return sessions;
}

/**
 * Formats L-T-P into standard string, e.g. "3-1-2 (8.0 hrs/wk)"
 */
export function formatLTP(params: LTPParams): string {
  const hours = calculateWeeklyTeachingHours(params);
  return `${params.lecture_count || 0}-${params.tutorial_count || 0}-${params.practical_count || 0} (${hours} hrs/wk)`;
}
