import { getAdminState } from "@/lib/engine";
import { EMPTY_ENGINE_STATE } from "@/lib/engine";
import { Admin } from "@/components/Admin";
import type { EngineState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const stateRes = await getAdminState();
  const state: EngineState = stateRes.status === 200 ? stateRes.data : EMPTY_ENGINE_STATE;
  return <Admin initialState={state} />;
}
