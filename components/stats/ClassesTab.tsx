"use client";
import { useEffect, useRef, useState } from "react";
import { fmtHours, type ClassCard, type ClassUnit, type DeptStats } from "@/lib/deptStats";
import { DayBars, FlagBadges, Panel, WeekStrip, tip } from "./ui";

const batchCount = (c: ClassCard) => c.units.filter(u => u.batch).length;

function UnitColumn({ u, max, card }: { u: ClassUnit; max: number; card: ClassCard }) {
  const who = `Sem ${card.semester} ${card.section}${u.batch ? "/" + u.batch : ""}`;
  const p = u.profile;
  return (
    <div className={`ds-unit sev-${u.severity}`}>
      <div className="ds-unit-head">
        <b>{u.label}</b>
        <span className="ds-muted" {...tip(`${who}\n${fmtHours(p.hours)} a week across ${p.daysActive} day${p.daysActive === 1 ? "" : "s"}`)}>{fmtHours(p.hours)} a week</span>
      </div>
      <DayBars profile={p} max={max} who={who} />
      <WeekStrip profile={p} gaps who={who} />
      <div className="ds-unit-foot" {...tip(p.gapMinutes ? `Free periods\n${fmtHours(p.gapMinutes / 60)} between classes, lunch and tea breaks excluded` : "No free periods between classes")}>
        <span className="ds-hatch-key" />{p.gapMinutes ? `${fmtHours(p.gapMinutes / 60)} free gaps` : "No free gaps"}
      </div>
    </div>
  );
}

export function ClassesTab({ stats, openId, onOpen }: { stats: DeptStats; openId: string | null; onOpen: (id: string | null) => void }) {
  const cards = stats.classes;
  const max = Math.max(6, ...cards.flatMap(c => c.units.flatMap(u => u.profile.dayMinutes.map(m => m / 60))));
  const [lit, setLit] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Arriving from an insight chip: scroll to the card and pulse it once.
  useEffect(() => {
    if (!openId) return;
    setLit(openId);
    document.getElementById(`ds-class-${openId.replace(":", "-")}`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    onOpen(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(null), 2400);
  }, [openId, onOpen]);
  const semesters = [...new Set(cards.map(c => c.semester))];
  if (!cards.length) return <Panel><p className="ds-empty">No class sessions match this filter.</p></Panel>;
  return (
    <>
      <div className="ds-toolbar"><span className="ds-muted">Bars show hours per day (Mon to Sat). Hatched blocks in the week are free periods between classes.</span></div>
      {semesters.map(sem => (
        <section key={sem} className="ds-group">
          <h2 className="ds-group-title">Semester {sem}</h2>
          <div className="ds-cards ds-cards-wide">
            {cards.filter(c => c.semester === sem).map(c => (
              <div key={c.key} id={`ds-class-${c.key.replace(":", "-")}`} className={`ds-card ds-class sev-${c.severity}${lit === c.key ? " is-lit" : ""}`}>
                <div className="ds-class-head">
                  <div><div className="ds-name">Section {c.section}</div><div className="ds-sub">{c.sessions} session{c.sessions === 1 ? "" : "s"} · {batchCount(c) ? `${batchCount(c)} lab batch${batchCount(c) === 1 ? "" : "es"}` : "no lab batches"}</div></div>
                  {c.flags.length > 0 && <FlagBadges flags={c.flags} max={2} />}
                </div>
                <div className={`ds-units n${c.units.length}`}>{c.units.map(u => <UnitColumn key={u.key} u={u} max={max} card={c} />)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
