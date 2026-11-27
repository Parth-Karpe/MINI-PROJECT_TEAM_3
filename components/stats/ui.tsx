"use client";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  CircleCheck, Clock, DoorClosed, DoorOpen, Flame, Gauge, Hourglass, Layers, OctagonAlert, Sunrise, Sunset, X,
} from "lucide-react";
import { DAYS, minutes, type PublishedSession } from "@/lib/publishedTimetable";
import { DAY_END, DAY_FULL, DAY_START, HOURS, clock, covered, sessionLine, type Flag, type GridCell, type IconKey, type Profile, type Severity } from "@/lib/deptStats";

/* ───────────── tooltips: any element with data-tip shows one ───────────── */

/** Tooltip text for an element that already has visible text (badges, buttons). First line is the title. */
export const tip = (text: string) => ({ "data-tip": text });
/** Tooltip text for a purely graphic element: also gives it an accessible name. */
export const tipImg = (text: string) => ({ "data-tip": text, role: "img", "aria-label": text.replace(/\n/g, ". ") });

export function TipLayer({ root }: { root: RefObject<HTMLElement | null> }) {
  const [t, setT] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const find = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);
    const at = (target: Element, x: number, y: number) => setT({ text: target.getAttribute("data-tip") || "", x, y });
    const over = (e: PointerEvent) => { const hit = find(e); if (hit) at(hit, e.clientX, e.clientY); else setT(null); };
    const move = (e: PointerEvent) => { const hit = find(e); if (hit) at(hit, e.clientX, e.clientY); };
    const focus = (e: FocusEvent) => { const hit = find(e); if (hit) { const b = hit.getBoundingClientRect(); at(hit, b.left + b.width / 2, b.bottom); } };
    const hide = () => setT(null);
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setT(null); };
    el.addEventListener("pointerover", over);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", hide);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusout", hide);
    el.addEventListener("click", hide);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerover", over); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", hide);
      el.removeEventListener("focusin", focus); el.removeEventListener("focusout", hide); el.removeEventListener("click", hide);
      window.removeEventListener("scroll", hide, true); document.removeEventListener("keydown", key);
    };
  }, [root]);
  if (!t) return null;
  const [title, ...rest] = t.text.split("\n");
  const flipX = typeof window !== "undefined" && t.x > window.innerWidth - 300;
  const flipY = typeof window !== "undefined" && t.y > window.innerHeight - 160;
  return (
    <div className={`ds-tip${flipX ? " flip-x" : ""}${flipY ? " flip-y" : ""}`} style={{ left: t.x, top: t.y }} role="tooltip">
      <strong>{title}</strong>
      {rest.map((line, i) => <span key={i}>{line}</span>)}
    </div>
  );
}

/* ───────────── colour ───────────── */

export type Tone = "ok" | "watch" | "problem" | "accent";
export const toneOf = (s: Severity): Tone => (s === "ok" ? "accent" : s);

/** One teal scale. 0 fades into the panel, 1 glows. */
export function heat(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  if (x === 0) return "rgba(79,209,197,0.035)";
  const k = x * x;
  return `rgba(${Math.round(79 + 60 * k)},${Math.round(209 + 36 * k)},${Math.round(197 + 35 * k)},${(0.14 + 0.86 * x).toFixed(3)})`;
}
export const glow = (t: number): CSSProperties => (t >= 0.85 ? { boxShadow: "0 0 10px rgba(79,209,197,0.55)" } : {});

/* ───────────── icons ───────────── */

const ICONS: Record<IconKey, typeof Clock> = {
  sunrise: Sunrise, sunset: Sunset, flame: Flame, gauge: Gauge, hourglass: Hourglass, door: DoorClosed, "door-open": DoorOpen,
  layers: Layers, clock: Clock, clash: OctagonAlert, check: CircleCheck,
};
export function Icon({ name, size = 14 }: { name: IconKey; size?: number }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={2} aria-hidden="true" />;
}

/* ───────────── badges and flags ───────────── */

export function Badge({ flag }: { flag: Flag }) {
  return <span className={`ds-badge tone-${flag.severity}`} {...tip(`${flag.label}\n${flag.detail}`)}><Icon name={flag.icon} size={12} />{flag.label}</span>;
}
export function FlagBadges({ flags, max = 2 }: { flags: Flag[]; max?: number }) {
  const sorted = [...flags].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "problem" ? -1 : 1));
  const shown = sorted.slice(0, max), rest = sorted.slice(max);
  return (
    <span className="ds-badges">
      {shown.map(f => <Badge key={f.id} flag={f} />)}
      {rest.length > 0 && <span className="ds-badge tone-mute" {...tip(`${rest.length} more\n${rest.map(f => f.label).join("\n")}`)}>+{rest.length}</span>}
    </span>
  );
}

/* ───────────── rings and bars ───────────── */

export function Ring({ value, size = 56, stroke = 6, tone = "accent", mark, tipText, children }: {
  value: number; size?: number; stroke?: number; tone?: Tone; mark?: number; tipText?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={`ds-ring tone-${tone}`} style={{ width: size, height: size }} {...(tipText ? tipImg(tipText) : {})}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ds-ring-track" cx={c} cy={c} r={r} strokeWidth={stroke} fill="none" />
        {v > 0 && <circle className="ds-ring-fill" cx={c} cy={c} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - v)} transform={`rotate(-90 ${c} ${c})`} style={{ "--circ": circ } as CSSProperties} />}
        {mark !== undefined && <g transform={`rotate(${mark * 360} ${c} ${c})`}><line className="ds-ring-mark" x1={c} x2={c} y1={c - r - stroke / 2 - 1} y2={c - r + stroke / 2 + 1} /></g>}
      </svg>
      {children && <div className="ds-ring-center">{children}</div>}
    </div>
  );
}

/** Morning (teal) against afternoon (amber). */
export function MixBar({ morning, afternoon }: { morning: number; afternoon: number }) {
  const total = morning + afternoon;
  const m = total ? (morning / total) * 100 : 0;
  return (
    <div className="ds-mix-bar" {...tipImg(`Morning ${(morning / 60).toFixed(1)} h · Afternoon ${(afternoon / 60).toFixed(1)} h\nSplit at 12:30, when lunch starts`)}>
      {total === 0 ? <span className="ds-mix-empty" /> : <>
        <span className="ds-mix-am" style={{ width: `${m}%` }} {...tip(`Morning\n${(morning / 60).toFixed(1)} h · ${Math.round(m)}%`)} />
        <span className="ds-mix-pm" style={{ width: `${100 - m}%` }} {...tip(`Afternoon\n${(afternoon / 60).toFixed(1)} h · ${Math.round(100 - m)}%`)} />
      </>}
    </div>
  );
}

/** Six vertical bars, Monday to Saturday, on a scale shared by every card so heights compare. */
export function DayBars({ profile, max, who }: { profile: Profile; max: number; who: string }) {
  return (
    <div className="ds-daybars" role="group" aria-label={`${who} day load`}>
      {DAYS.map((d, i) => {
        const h = profile.dayMinutes[i] / 60;
        const tone: Tone = h >= 7 ? "problem" : h >= 6 ? "watch" : "accent";
        return (
          <div className="ds-daybar" key={d}>
            <div className="ds-daybar-well" {...tipImg(`${DAY_FULL[i]}\n${h.toFixed(1)} h across ${profile.daySessions[i]} session${profile.daySessions[i] === 1 ? "" : "s"}`)}>
              <span className={`ds-daybar-fill tone-${tone}`} style={{ height: `${Math.max(h ? 6 : 0, (h / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
            </div>
            <span className="ds-daybar-label">{d[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── week strip: 6 rows × 9 cells ───────────── */

function cellTip(di: number, hour: number, cell: GridCell, gapMin: number): string {
  const head = `${DAY_FULL[di]} ${clock(hour * 60)}–${clock(hour * 60 + 60)}`;
  if (!cell.sessions.length) return gapMin >= 30 ? `${head}\nFree period: ${Math.round(gapMin)} min between classes` : `${head}\nNothing scheduled`;
  const shown = cell.sessions.slice(0, 4).map(sessionLine);
  const more = cell.sessions.length - shown.length;
  return [head, `${cell.minutes} of 60 min in use`, ...shown, ...(more > 0 ? [`+${more} more`] : [])].join("\n");
}

export function WeekStrip({ profile, gaps = false, who }: { profile: Profile; gaps?: boolean; who: string }) {
  return (
    <div className="ds-strip" role="group" aria-label={`${who} week`}>
      {DAYS.map((d, di) => (
        <Fragment key={d}>
          <span className="ds-strip-day">{d[0]}</span>
          {HOURS.map((h, hi) => {
            const cell = profile.grid[di][hi];
            const frac = cell.minutes / 60;
            const gapMin = gaps ? covered(profile.gaps[di], h * 60, h * 60 + 60) : 0;
            const hatched = gaps && frac < 0.5 && gapMin >= 30;
            return <span key={h} className={`ds-cell${hatched ? " is-gap" : ""}`} style={frac > 0 ? { background: heat(frac), ...glow(frac) } : undefined} {...tipImg(cellTip(di, h, cell, gapMin))} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}

/* ───────────── blocks on a day track (week grid + timeline) ───────────── */

const pos = (m: number) => `${((m - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
const wide = (s: number, e: number) => `${((e - s) / (DAY_END - DAY_START)) * 100}%`;

export function HourAxis() {
  return <div className="ds-axis" aria-hidden="true">{HOURS.map(h => <span key={h}>{String(h).padStart(2, "0")}</span>)}</div>;
}

function packLanes(rows: PublishedSession[]): PublishedSession[][] {
  const lanes: PublishedSession[][] = [];
  for (const r of [...rows].sort((a, b) => minutes(a.start_time) - minutes(b.start_time))) {
    const lane = lanes.find(l => minutes(l[l.length - 1].end_time) <= minutes(r.start_time));
    if (lane) lane.push(r); else lanes.push([r]);
  }
  return lanes;
}

export function Block({ r, main, sub, clash, who }: { r: PublishedSession; main: string; sub?: string; clash?: boolean; who?: string }) {
  const s = minutes(r.start_time), e = minutes(r.end_time);
  return (
    <span className={`ds-block${clash ? " is-clash" : ""}`} style={{ left: pos(s), width: wide(s, e) }} {...tipImg(`${who ? who + " · " : ""}${r.course_code} (${r.session_type})\n${DAY_FULL[DAYS.indexOf(r.day)]} ${r.start_time}–${r.end_time}\n${r.room_id} · Sem ${r.semester} ${r.section}${r.batch ? "/" + r.batch : ""}${clash ? "\nOverlaps another session" : ""}`)}>
      <b>{main}</b>{sub && <small>{sub}</small>}
    </span>
  );
}

/** Full week: one row per day, sessions placed on an hourly track. Overlaps stack and turn coral. */
export function WeekGrid({ rows, label }: { rows: PublishedSession[]; label: (r: PublishedSession) => { main: string; sub?: string } }) {
  return (
    <div className="ds-wg" role="group" aria-label="Full week">
      <div className="ds-wg-head"><span /><HourAxis /></div>
      {DAYS.map((d, di) => {
        const lanes = packLanes(rows.filter(r => r.day === d));
        const stacked = lanes.length > 1;
        return (
          <div className="ds-wg-row" key={d}>
            <span className="ds-wg-day" {...tip(DAY_FULL[di])}>{d}</span>
            <div className="ds-track" style={{ height: Math.max(1, lanes.length) * 40 }}>
              {lanes.map((lane, li) => (
                <div className="ds-lane" key={li} style={{ top: li * 40, height: 40 }}>
                  {lane.map(r => { const l = label(r); return <Block key={r.entry_id} r={r} main={l.main} sub={l.sub} clash={stacked} />; })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── structure ───────────── */

export function Panel({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ds-panel ${className}`}>
      {(title || aside) && <div className="ds-panel-head"><h2 className="ds-panel-title">{title}</h2>{aside}</div>}
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ items, value, onChange, label, variant = "tabs" }: {
  items: { id: T; label: string; icon?: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string; variant?: "tabs" | "segmented";
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex(x => x.id === value);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    const target = items[(next + items.length) % items.length];
    onChange(target.id);
    requestAnimationFrame(() => (e.currentTarget.querySelector(`[data-tab="${target.id}"]`) as HTMLElement | null)?.focus());
  };
  return (
    <div className={`ds-${variant}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map(it => (
        <button key={it.id} type="button" role="tab" data-tab={it.id} id={`ds-tab-${variant}-${it.id}`} aria-selected={it.id === value} tabIndex={it.id === value ? 0 : -1}
          className={it.id === value ? "on" : ""} onClick={() => onChange(it.id)}>
          {it.icon}{it.label}{it.count !== undefined && <span className="ds-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SidePanel({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(".ds-close")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // If the opener is gone (a chip switched tabs), land on the active tab instead of the page body.
      (opener && opener !== document.body && opener.isConnected ? opener : document.querySelector<HTMLElement>('.ds-tabs [role="tab"][aria-selected="true"]'))?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="ds-backdrop" onClick={onClose} />
      <aside className="ds-side" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <button type="button" className="ds-close" onClick={onClose} aria-label="Close details"><X size={16} /></button>
        {children}
      </aside>
    </>
  );
}

/** A div that behaves like a button, so cards can hold tooltips and other non-interactive content. */
export function pressable(onPress: () => void, label: string) {
  return {
    role: "button" as const, tabIndex: 0, "aria-label": label, onClick: onPress,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPress(); } },
  };
}
