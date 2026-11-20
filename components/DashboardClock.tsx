"use client";

import { useEffect, useState } from "react";

const key = "smart-campus.dashboard-test-clock";
const clockChanged = "dashboard-test-clock-change";
const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short", hourCycle: "h23",
});
const campusNow = () => formatter.format(new Date()).replace(" ", "T");

export function useDashboardClock(enabled: boolean) {
  const [live, setLive] = useState("");
  const [override, setOverride] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const read = () => setOverride(localStorage.getItem(key) || "");
    const tick = () => setLive(campusNow());
    read();
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("storage", read);
    window.addEventListener(clockChanged, read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", read);
      window.removeEventListener(clockChanged, read);
    };
  }, [enabled]);

  function setClock(value: string) {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    setOverride(value);
    window.dispatchEvent(new Event(clockChanged));
  }

  return { now: enabled ? override || live : "", isTesting: !!override, setClock };
}

export function DashboardClock({ now, isTesting, setClock }: ReturnType<typeof useDashboardClock>) {
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const selectedDate = date ?? now.slice(0, 10);
  const selectedTime = time ?? now.slice(11, 16);

  function clearFields() {
    setDate(null);
    setTime(null);
  }

  return <section className="sidebar-clock" aria-labelledby="dashboard-clock-title">
    <h2 id="dashboard-clock-title">Test clock</h2>
    <p>{isTesting ? "Test" : "Live"} · {now && <time dateTime={now + "+05:30"}>{now.slice(11, 16)} </time>}IST</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (!selectedDate || !selectedTime) return;
      setClock(selectedDate + "T" + selectedTime);
      clearFields();
    }}>
      <label>Date<input type="date" required value={selectedDate} onChange={event => setDate(event.target.value)} /></label>
      <label>Time<input type="time" required value={selectedTime} onChange={event => setTime(event.target.value)} /></label>
      <div className="sidebar-clock-actions">
        <button className="sec" type="submit" disabled={!now}>Set test time</button>
      {isTesting && <button type="button" onClick={() => {
        setClock("");
        clearFields();
      }} className="sec">Use live time</button>}
      </div>
    </form>
  </section>;
}
