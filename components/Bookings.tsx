"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt, hm, ms, todayMs, ymd } from "@/lib/time";
import type { EngineState, PendingRequest, RejectedRequest, Resource } from "@/lib/types";

interface BookingsProps {
  initialState: EngineState;
}

interface Msg {
  text: string;
  kind: string;
}

export function Bookings({ initialState }: BookingsProps) {
  const [state, setState] = useState<EngineState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [rqMsg, setRqMsg] = useState<Msg | null>(null);
  const [resolveMsg, setResolveMsg] = useState<Msg | null>(null);

  const defaultStart = `${ymd(todayMs() + 864e5)}T09:00`;
  const defaultEnd = `${ymd(todayMs() + 864e5)}T10:00`;

  const [reqForm, setReqForm] = useState({
    request_id: "",
    user_id: "",
    resource_id: "",
    start: defaultStart,
    end: defaultEnd,
    role: "",
    group_size: "1",
  });

  const refresh = useCallback(async () => {
    const t = todayMs();
    const a = new Date(t);
    const b = new Date(t + 14 * 864e5);
    try {
      const st = await apiGet<EngineState>(`/api/admin/state?window_start=${a.toISOString()}&window_end=${b.toISOString()}&now=${new Date().toISOString()}`);
      setState(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const adhoc = state.accepted.filter((a) => !a.is_timetable);

  const byResource = new Map<string, PendingRequest[]>();
  for (const p of state.pending) {
    const arr = byResource.get(p.resource_id) ?? [];
    arr.push(p);
    byResource.set(p.resource_id, arr);
  }

  const submitRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const resource = state.resources.find((r) => r.resource_id === String(f.get("resource_id") ?? ""));
    const payload = {
      request_id: String(f.get("request_id") ?? ""),
      user_id: String(f.get("user_id") ?? ""),
      resource_id: String(f.get("resource_id") ?? ""),
      resource_type: resource ? resource.resource_type : "",
      start: `${String(f.get("start") ?? "")}:00`,
      end: `${String(f.get("end") ?? "")}:00`,
      role: f.get("role") || null,
      group_size: Number(f.get("group_size") ?? 1) || 1,
      now: new Date().toISOString(),
    };
    try {
      const o = await apiPost<{ request_id: string; status: string }>("/api/requests", payload);
      setRqMsg({
        text: o.status === "pending" ? `${o.request_id} is in the queue. It's decided 8 hours before it starts, together with every overlapping request.` : `${o.request_id} → ${o.status}`,
        kind: o.status === "confirmed" ? "ok" : o.status === "rejected" ? "err" : "ok",
      });
      await refresh();
    } catch (er) {
      setRqMsg({ text: er instanceof Error ? er.message : "Failed to submit request", kind: "err" });
    }
  };

  const resolveDue = async () => {
    try {
      const r = await apiPost<{ resolved_count: number }>("/api/admin/resolve", { now: new Date().toISOString() });
      setResolveMsg({ text: r.resolved_count ? `Resolved ${r.resolved_count} request(s).` : "Nothing due yet.", kind: "ok" });
      await refresh();
    } catch (e) {
      setResolveMsg({ text: e instanceof Error ? e.message : "Resolve failed", kind: "err" });
    }
  };

  const cancelBooking = async (id: string) => {
    try {
      await apiPost("/api/cancel", { request_id: id, now: new Date().toISOString() });
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  const pendingByResource = [...byResource.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="grid">
        <div className="card">
          <h3>New request</h3>
          <form className="f" id="rq-form" onSubmit={submitRequest}>
            <div className="r2">
              <div>
                <label>Request ID</label>
                <input name="request_id" required value={reqForm.request_id} onChange={(e) => setReqForm({ ...reqForm, request_id: e.target.value })} />
              </div>
              <div>
                <label>User</label>
                <input name="user_id" required value={reqForm.user_id} onChange={(e) => setReqForm({ ...reqForm, user_id: e.target.value })} />
              </div>
            </div>
            <div>
              <label>Resource</label>
              <select name="resource_id" className="res-sel" required value={reqForm.resource_id} onChange={(e) => setReqForm({ ...reqForm, resource_id: e.target.value })}>
                {state.resources.map((r: Resource) => (
                  <option key={r.resource_id} value={r.resource_id}>
                    {r.resource_id} ({r.resource_type}, cap {r.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div className="r2">
              <div>
                <label>Start</label>
                <input type="datetime-local" name="start" required value={reqForm.start} onChange={(e) => setReqForm({ ...reqForm, start: e.target.value })} />
              </div>
              <div>
                <label>End</label>
                <input type="datetime-local" name="end" required value={reqForm.end} onChange={(e) => setReqForm({ ...reqForm, end: e.target.value })} />
              </div>
            </div>
            <div className="r2">
              <div>
                <label>Role (sets priority)</label>
                <select name="role" value={reqForm.role} onChange={(e) => setReqForm({ ...reqForm, role: e.target.value })}>
                  <option value="">student</option>
                  <option value="faculty">faculty</option>
                  <option value="hod">hod</option>
                </select>
              </div>
              <div>
                <label>Group size</label>
                <input type="number" name="group_size" min={1} value={reqForm.group_size} onChange={(e) => setReqForm({ ...reqForm, group_size: e.target.value })} />
              </div>
            </div>
            <div>
              <button>Submit request</button>
            </div>
          </form>
          <div className="msg" id="rq-msg">{rqMsg?.text ?? ""}</div>
        </div>
        <div className="card">
          <h3>Batch resolution</h3>
          <p className="msg" style={{ marginTop: 0 }}>
            Pending requests are decided together once their batch window closes.
          </p>
          <button className="sec" id="resolve-go" onClick={resolveDue}>
            Resolve due batches now
          </button>
          <div className="msg" id="resolve-msg">{resolveMsg?.text ?? ""}</div>
        </div>
      </div>
      <div className="grid">
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h3>Queues by resource: each request is decided 8 hours before it starts, together with every overlapping request</h3>
          <div id="b-pend">
            {pendingByResource.length ? (
              pendingByResource.map(([rid, list]) => (
                <div key={rid} style={{ marginBottom: 14 }}>
                  <b className="mono">{rid}</b> <span className="msg">{list.length} waiting</span>
                  <table>
                    <tbody>
                      <tr>
                        <th>Rank</th>
                        <th>Request</th>
                        <th>User</th>
                        <th>Wants</th>
                        <th>Decided at</th>
                        <th>Score</th>
                      </tr>
                      {list
                        .slice()
                        .sort((a: PendingRequest, b: PendingRequest) => (b.score ?? 0) - (a.score ?? 0))
                        .map((p, i) => (
                          <tr key={p.request_id}>
                            <td>{i + 1}</td>
                            <td>{p.request_id}</td>
                            <td>
                              {p.user_id}{" "}
                              <span className="msg">
                                {p.role ?? "student"}, group {p.group_size || 1}
                              </span>
                            </td>
                            <td>
                              {fmt(p.start)}–{hm(ms(p.end))}
                            </td>
                            <td>{fmt(p.decide_at)}</td>
                            <td>{p.score}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              <div className="empty">No requests waiting.</div>
            )}
          </div>
        </div>
        <div className="card">
          <h3>Rejected / waitlisted</h3>
          <div className="scroll" id="b-rej">
            {state.rejected.length ? (
              <table>
                <tbody>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Resource</th>
                    <th>When</th>
                    <th>Why</th>
                  </tr>
                  {[...state.rejected]
                    .sort((a: RejectedRequest, b: RejectedRequest) => (b.priority ?? 0) - (a.priority ?? 0))
                    .map((r) => (
                      <tr key={r.request_id}>
                        <td>{r.request_id}</td>
                        <td>{r.user_id}</td>
                        <td className="mono">{r.resource_id}</td>
                        <td>
                          {fmt(r.start)}–{hm(ms(r.end))}
                        </td>
                        <td className="msg">{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Nobody rejected or waitlisted.</div>
            )}
          </div>
        </div>
        <div className="card">
          <h3>Confirmed ad hoc bookings (next 2 weeks)</h3>
          <div className="scroll" id="b-ok">
            {adhoc.length ? (
              <table>
                <tbody>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Resource</th>
                    <th>When</th>
                    <th></th>
                  </tr>
                  {adhoc.map((a) => (
                    <tr key={a.request_id}>
                      <td>{a.request_id}</td>
                      <td>{a.user_id}</td>
                      <td className="mono">{a.resource_id}</td>
                      <td>
                        {fmt(a.start)}–{hm(ms(a.end))}
                      </td>
                      <td>
                        <button className="sec" onClick={() => cancelBooking(a.request_id)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No ad hoc bookings in this range.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
