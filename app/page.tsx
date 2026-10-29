import { getAdminState, getTimetable, EMPTY_ENGINE_STATE, EMPTY_TIMETABLE } from "@/lib/engine";
import { Overview } from "@/components/Overview";
import type { EngineState, TimetableState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  const timetableRes = await getTimetable();
  const timetable: TimetableState = timetableRes.status === 200 ? timetableRes.data : EMPTY_TIMETABLE;

  return <Overview initialState={state} initialTimetable={timetable} initialAnalyzed={null} />;
}
