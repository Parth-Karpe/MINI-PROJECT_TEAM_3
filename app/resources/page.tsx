import { getAdminState } from "@/lib/engine";
import { EMPTY_ENGINE_STATE } from "@/lib/engine";
import { Resources } from "@/components/Resources";
import type { EngineState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  return <Resources initialState={state} />;
}
