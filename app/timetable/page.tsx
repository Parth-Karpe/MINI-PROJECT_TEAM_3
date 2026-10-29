import { getAdminState, getTimetable } from "@/lib/engine";
import { EMPTY_ENGINE_STATE, EMPTY_TIMETABLE } from "@/lib/engine";
import { Timetable } from "@/components/Timetable";
import type { AnalysisReport, EngineState, TimetableState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  const timetableRes = await getTimetable();
  const timetable: TimetableState = timetableRes.status === 200 ? timetableRes.data : EMPTY_TIMETABLE;

  return <Timetable initialTimetable={timetable} initialAnalyzed={null} initialState={state} />;
}
