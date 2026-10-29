import { getAdminState, getTimetable, EMPTY_ENGINE_STATE, EMPTY_TIMETABLE } from "@/lib/engine";
import { Schedule } from "@/components/Schedule";
import type { EngineState, TimetableState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  const timetableRes = await getTimetable();
  const timetable: TimetableState = timetableRes.status === 200 ? timetableRes.data : EMPTY_TIMETABLE;

  return <Schedule initialState={state} initialTimetable={timetable} />;
}
