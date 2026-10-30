import { getAdminState } from "@/lib/engine";
import { EMPTY_ENGINE_STATE } from "@/lib/engine";
import { Bookings } from "@/components/Bookings";
import type { EngineState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  return <Bookings initialState={state} />;
}
