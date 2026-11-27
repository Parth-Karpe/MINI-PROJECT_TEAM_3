"use client";
import { useState } from "react";
import { DAYS } from "@/lib/publishedTimetable";
import { DAY_FULL, HOURS, clock, type DeptStats, type Insight } from "@/lib/deptStats";
import { Icon, Panel, glow, heat, tip, tipImg, toneOf } from "./ui";

const VISIBLE = 8;

export function OverviewTab({ stats, onPick }: { stats: DeptStats; onPick: (target: NonNullable<Insight["target"]>) => void }) {
  const { cells, max } = stats.heat;
  const [all, setAll] = useState(false);
  const flaggedList = stats.insights.filter(i => i.severity !== "ok");
  const okList = stats.insights.filter(i => i.severity === "ok");
  const flagged = flaggedList.length;
  const visible = [...(all ? flaggedList : flaggedList.slice(0, VISIBLE)), ...okList];
  return (
    <div className="ds-split">
      <Panel title="Week at a glance" aside={
        <div className="ds-legend" {...tip(`Sessions running in an hour\nFaint is empty, bright is the busiest hour (${max})`)}>
          <span>0</span><i /><span>{max}</span>
        </div>}>
        {max === 0 ? <p className="ds-empty">No sessions match this filter.</p> : <>
          <div className="ds-heat">
            <span />
            {HOURS.map(h => <span key={h} className="ds-heat-hour">{String(h).padStart(2, "0")}</span>)}
            {DAYS.map((d, di) => (
              <div className="ds-heat-row" key={d}>
                <span className="ds-heat-day" {...tip(DAY_FULL[di])}>{d}</span>
                {HOURS.map((h, hi) => {
                  const c = cells[di][hi], t = max ? c.sessions / max : 0;
                  const text = `${DAY_FULL[di]} ${clock(h * 60)}–${clock(h * 60 + 60)}\n${c.sessions} session${c.sessions === 1 ? "" : "s"} running\n${c.rooms} room${c.rooms === 1 ? "" : "s"} in use\n${c.faculty} faculty teaching`;
                  return <span key={h} className={`ds-heat-cell${t > 0.55 ? " is-bright" : ""}`} style={{ background: heat(t), ...glow(t) }} {...tipImg(text)}>{c.sessions || ""}</span>;
                })}
              </div>
            ))}
          </div>
          <p className="ds-note">Sessions running in each hour. Scheduled use, not attendance.</p>
        </>}
      </Panel>

      <Panel title="What to look at" aside={<span className="ds-muted">{flagged ? `${flagged} to review` : "Nothing to review"}</span>}>
        <div className="ds-chips">
          {stats.insights.length === 0 && <p className="ds-empty">Insights appear once there are sessions to analyse.</p>}
          {visible.map(i => {
            const body = <><Icon name={i.icon} size={14} /><span>{i.text}</span></>;
            const props = { className: `ds-chip tone-${toneOf(i.severity)}`, ...tip(`${i.text}\n${i.detail}`) };
            return i.target
              ? <button type="button" key={i.id} {...props} onClick={() => onPick(i.target!)}>{body}</button>
              : <span key={i.id} {...props}>{body}</span>;
          })}
        </div>
        {flagged > VISIBLE && <button type="button" className="ds-more" onClick={() => setAll(v => !v)} aria-expanded={all}>{all ? "Show fewer" : `Show all ${flagged}`}</button>}
        <p className="ds-note">One chip per person, room or section, worst flag first. Select one to jump to it.</p>
      </Panel>
    </div>
  );
}
