"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/time";
import type { AuditResponse, EngineState } from "@/lib/types";

interface AdminProps {
  initialState: EngineState;
}

interface Msg {
  text: string;
  kind: string;
}

export function Admin({ initialState }: AdminProps) {
  const [state, setState] = useState<EngineState>(initialState);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditQuery, setAuditQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overrideMsg, setOverrideMsg] = useState<Msg | null>(null);
  const [resetMsg, setResetMsg] = useState<Msg | null>(null);

  const defaultStart = `${new Date().toISOString().slice(0, 10)}T09:00`;
  const defaultEnd = `${new Date().toISOString().slice(0, 10)}T10:00`;

  const [ovForm, setOvForm] = useState({
    request_id: "",
    user_id: "",
    resource_id: "",
    start: defaultStart,
    end: defaultEnd,
    group_size: "1",
    actor_id: "",
    actor_role: "hod",
    reason: "",
  });

  const refresh = useCallback(async () => {
    try {
      const st = await apiGet<EngineState>("/api/admin/state");
      setState(st);
      const a = await apiGet<AuditResponse>("/api/audit");
      setAudit(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitOverride = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const resource = state.resources.find((r) => r.resource_id === String(f.get("resource_id") ?? ""));
    try {
      const o = await apiPost<{ status: string; cleared_request_ids: string[] }>("/api/admin/manual-override", {
        request_id: String(f.get("request_id") ?? ""),
        user_id: String(f.get("user_id") ?? ""),
        resource_id: String(f.get("resource_id") ?? ""),
        resource_type: resource ? resource.resource_type : "",
        start: `${String(f.get("start") ?? "")}:00`,
        end: `${String(f.get("end") ?? "")}:00`,
        group_size: Number(f.get("group_size") ?? 1) || 1,
        actor_id: String(f.get("actor_id") ?? ""),
        actor_role: String(f.get("actor_role") ?? "hod"),
        reason: String(f.get("reason") ?? ""),
        now: new Date().toISOString(),
      });
      setOverrideMsg({ text: `${o.status}. Cleared: ${o.cleared_request_ids.length ? o.cleared_request_ids.join(", ") : "nothing"}.`, kind: o.status === "confirmed" ? "ok" : "err" });
      await refresh();
    } catch (er) {
      setOverrideMsg({ text: er instanceof Error ? er.message : "Override failed", kind: "err" });
    }
  };

  const submitReset = async () => {
    if (!window.confirm("Reset EVERYTHING on the server? This cannot be undone.")) return;
    try {
      await apiPost("/api/reset", {});
      setResetMsg({ text: "Reset.", kind: "ok" });
      await refresh();
    } catch (e) {
      setResetMsg({ text: e instanceof Error ? e.message : "Reset failed", kind: "err" });
    }
  };

  const auditRows = (audit?.entries ?? []).filter((e) => {
    const q = auditQuery.toLowerCase();
    if (!q) return true;
    return JSON.stringify(e).toLowerCase().includes(q);
  });

  const overrideResourceType = (rid: string) => state.resources.find((r) => r.resource_id === rid)?.resource_type ?? "";

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="grid">
        <div className="card">
          <h3>Manual override</h3>
          <p className="msg" style={{ marginTop: 0 }}>
            Forces one booking through, clearing whatever is in its way for that single occurrence. The default timetable itself is not rewritten.
          </p>
          <form className="f" id="ov-form" onSubmit={submitOverride}>
            <div className="r2">
              <div>
                <label>Request ID</label>
                <input name="request_id" required value={ovForm.request_id} onChange={(e) => setOvForm({ ...ovForm, request_id: e.target.value })} />
              </div>
              <div>
                <label>User</label>
                <input name="user_id" required value={ovForm.user_id} onChange={(e) => setOvForm({ ...ovForm, user_id: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Resource</label>
              <select name="resource_id" className="res-sel" required value={ovForm.resource_id} onChange={(e) => setOvForm({ ...ovForm, resource_id: e.target.value })}>
                {state.resources.map((r) => (
                  <option key={r.resource_id} value={r.resource_id}>
                    {r.resource_id}
                  </option>
                ))}
              </select>
            </div>
            <div className="r2">
              <div>
                <label>Start</label>
                <input type="datetime-local" name="start" required value={ovForm.start} onChange={(e) => setOvForm({ ...ovForm, start: e.target.value })} />
              </div>
              <div>
                <label>End</label>
                <input type="datetime-local" name="end" required value={ovForm.end} onChange={(e) => setOvForm({ ...ovForm, end: e.target.value })} />
              </div>
            </div>
            <div className="r2">
              <div>
                <label>Group size</label>
                <input type="number" name="group_size" min={1} value={ovForm.group_size} onChange={(e) => setOvForm({ ...ovForm, group_size: e.target.value })} />
              </div>
              <div>
                <label>HOD ID</label>
                <input name="actor_id" required value={ovForm.actor_id} onChange={(e) => setOvForm({ ...ovForm, actor_id: e.target.value })} />
              </div>
              <div>
                <label>Role</label>
                <input name="actor_role" required value={ovForm.actor_role} onChange={(e) => setOvForm({ ...ovForm, actor_role: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Reason (audit-logged)</label>
              <input name="reason" required value={ovForm.reason} onChange={(e) => setOvForm({ ...ovForm, reason: e.target.value })} />
            </div>
            <div>
              <button className="danger">Force this booking</button>
            </div>
          </form>
          <div className="msg" id="ov-msg">{overrideMsg?.text ?? ""}</div>
        </div>
        <div className="card">
          <h3>Danger zone</h3>
          <p className="msg" style={{ marginTop: 0 }}>
            Wipes all resources, timetable, bookings and imported reference data from the running server.
          </p>
          <button className="danger" id="reset-go" onClick={submitReset}>
            Reset everything
          </button>
          <div className="msg" id="reset-msg">{resetMsg?.text ?? ""}</div>
        </div>
      </div>
      <div className="card">
        <div className="bar">
          <h3 style={{ margin: 0 }}>Audit trail</h3>
          <div>
            <input id="a-q" placeholder="filter…" value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />
          </div>
        </div>
        <div className="scroll" id="audit">
          {auditRows.length ? (
            <table>
              <tbody>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Request</th>
                  <th>Resource</th>
                  <th>User</th>
                  <th>Details</th>
                </tr>
                {auditRows.slice(0, 60).map((e, i) => (
                  <tr key={`${e.ts ?? ""}-${e.event_type}-${i}`}>
                    <td className="mono">{e.ts ? fmt(e.ts) : ""}</td>
                    <td>{e.event_type}</td>
                    <td>{e.request_id}</td>
                    <td className="mono">{e.resource_id}</td>
                    <td>{e.user_id}</td>
                    <td className="msg">{Object.entries(e.details ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No activity yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
