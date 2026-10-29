"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { esc } from "@/lib/time";
import type { EngineState, Resource } from "@/lib/types";

interface ResourcesProps {
  initialState: EngineState;
}

interface RoomFile {
  name: string;
  text: string;
}

const ROOM_TEMPLATE = "room_id,name,type,capacity,building,exclusive_use\nCS-LAB-1,Programming Lab 1,lab,60,Block-A,yes\n";

export function Resources({ initialState }: ResourcesProps) {
  const [resources, setResources] = useState<Resource[]>(initialState.resources);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomsFile, setRoomsFile] = useState<RoomFile | null>(null);
  const [roomsGoDisabled, setRoomsGoDisabled] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const st = await apiGet<EngineState>("/api/admin/state");
      setResources(st.resources ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resources");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const say = (text: string, kind = "ok") => setMsg({ text, kind });

  const rResources = () => {
    const q = query.toLowerCase();
    const rows = resources.filter(
      (r) =>
        (!type || r.resource_type === type) &&
        (!q || (r.resource_id + r.name + (r.location ?? "")).toLowerCase().includes(q))
    );
    return rows;
  };

  const onRoomsFilePicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = await files[0].text();
    const cleaned = f.replace(/^\uFEFF/, "");
    const head = (cleaned.split(/\r?\n/)[0] || "").split(",").map((x) => x.trim().toLowerCase().replace(/ /g, "_"));
    const miss = ["room_id", "name", "type", "capacity"].filter((c) => !head.includes(c));
    if (miss.length) {
      setRoomsFile(null);
      setRoomsGoDisabled(true);
      say(`${files[0].name}: missing column(s) ${miss.join(", ")}`, "err");
      return;
    }
    setRoomsFile({ name: files[0].name, text: cleaned });
    setRoomsGoDisabled(false);
  };

  const download = (name: string, text: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name;
    a.click();
  };

  const onSubmitResource = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = [
      {
        resource_id: String(f.get("resource_id") ?? ""),
        name: String(f.get("name") ?? ""),
        resource_type: String(f.get("resource_type") ?? ""),
        capacity: Number(f.get("capacity") ?? 1) || 1,
        location: String(f.get("location") ?? "") || "",
        department: String(f.get("department") ?? "") || "",
        exclusive_use: f.get("exclusive_use") === "true",
      },
    ];
    try {
      const r = await apiPost<{ status: string; resource_count: number }>("/api/resources", payload);
      say(`Added. ${r.resource_count} resources total.`);
      (e.target as HTMLFormElement).reset();
      refresh();
    } catch (er) {
      say(er instanceof Error ? er.message : "Failed to add resource", "err");
    }
  };

  const onImportRooms = async () => {
    if (!roomsFile) return;
    try {
      const r = await apiPost<{ resource_count: number }>("/api/import/rooms", { csv_text: roomsFile.text });
      say(`Imported. ${r.resource_count} resources registered in total.`);
      setRoomsFile(null);
      setRoomsGoDisabled(true);
      refresh();
    } catch (er) {
      say(er instanceof Error ? er.message : "Failed to import rooms", "err");
    }
  };

  const rows = rResources();

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="grid">
        <div className="card">
          <h3>Import from a CSV file</h3>
          <label
            className="drop"
            htmlFor="rooms-file-input"
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => e.preventDefault()}
            onDragLeave={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onRoomsFilePicked(e.dataTransfer.files);
            }}
          >
            <input
              id="rooms-file-input"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={(e) => {
                onRoomsFilePicked(e.target.files);
                e.target.value = "";
              }}
            />
            <b>Choose a CSV file</b> or drop it here
            <span>columns: room_id, name, type, capacity, building, exclusive_use</span>
            <span className="fn">{roomsFile ? roomsFile.name : ""}</span>
          </label>
          <div className="bar" style={{ margin: 12 }}>
            <button id="rooms-go" disabled={roomsGoDisabled} onClick={onImportRooms}>
              Import resources
            </button>
            <button className="sec" id="rooms-tpl" onClick={() => download("rooms_template.csv", ROOM_TEMPLATE)}>
              Download template
            </button>
          </div>
          <div className="msg" id="rooms-msg">{msg?.text ?? ""}</div>
        </div>
        <div className="card">
          <h3>Add one resource</h3>
          <form className="f" id="res-form" onSubmit={onSubmitResource}>
            <div className="r2">
              <div>
                <label>ID</label>
                <input name="resource_id" required placeholder="LAB-A" />
              </div>
              <div>
                <label>Name</label>
                <input name="name" required placeholder="Robotics Lab" />
              </div>
            </div>
            <div className="r3">
              <div>
                <label>Type</label>
                <input name="resource_type" required placeholder="lab" />
              </div>
              <div>
                <label>Capacity</label>
                <input name="capacity" type="number" defaultValue={1} min={1} required />
              </div>
              <div>
                <label>Exclusive use?</label>
                <select name="exclusive_use" defaultValue="true">
                  <option value="true">Yes (whole room)</option>
                  <option value="false">No (shareable)</option>
                </select>
              </div>
            </div>
            <div className="r2">
              <div>
                <label>Building / location</label>
                <input name="location" />
              </div>
              <div>
                <label>Department</label>
                <input name="department" />
              </div>
            </div>
            <div>
              <button>Add resource</button>
            </div>
          </form>
          <div className="msg" id="res-msg">{msg?.text ?? ""}</div>
        </div>
      </div>
      <div className="card">
        <div className="bar">
          <div>
            <label>Search</label>
            <input id="r-q" placeholder="ID, name, building…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div>
            <label>Type</label>
            <select id="r-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {[...new Set(resources.map((r) => r.resource_type).filter(Boolean))].sort().map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="scroll" id="r-table">
          {rows.length ? (
            <table>
              <tbody>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Building</th>
                  <th>Use</th>
                </tr>
                {rows.map((r) => (
                  <tr key={r.resource_id}>
                    <td className="mono">{esc(r.resource_id)}</td>
                    <td>{esc(r.name)}</td>
                    <td>{esc(r.resource_type)}</td>
                    <td>{r.capacity}</td>
                    <td>{esc(r.location)}</td>
                    <td>{r.exclusive_use === false ? "shared" : "exclusive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No resources match.</div>
          )}
        </div>
      </div>
    </>
  );
}
