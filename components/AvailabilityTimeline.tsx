import { minutes } from "@/lib/publishedTimetable";
import type { Availability, FreeSlot } from "./ResourceAvailability";

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function AvailabilityTimeline({ rows, from, to, reserve }: {
  rows: Availability[]; from: string; to: string;
  reserve?: (id: string, slot: FreeSlot) => void;
}) {
  const start = minutes(from);
  const end = minutes(to);
  const width = end - start;
  const percent = (time: number) => `${((time - start) / width) * 100}%`;
  const hours = [start];
  for (let hour = Math.ceil((start + 1) / 60) * 60; hour < end; hour += 60) {
    if (end - hour >= Math.min(width / 4, 20)) hours.push(hour);
  }

  return <>
    <ul className="availability-legend"><li><span className="availability-free" /> Free</li><li><span className="availability-busy" /> Unavailable</li></ul>
    <div className="availability-scroll" role="region" aria-label="Resource availability matrix" tabIndex={0}>
      <div className="availability-grid" role="table" aria-label="Resources by time">
        <div className="availability-row" role="row">
          <div className="availability-label" role="columnheader">Resource</div>
          <div className="availability-ruler" role="columnheader" aria-label={`${from} to ${to}, IST`}>
            {hours.map(hour => <span key={hour} style={{ left: percent(hour) }}>{clock(hour)}</span>)}
            <span className="availability-end">{to}</span>
          </div>
        </div>
        {rows.map(row => <div className="availability-row" role="row" key={row.id}>
          <div className="availability-label" role="rowheader">
            <strong>{row.name || row.id}</strong>
            <small>{row.name && row.name !== row.id ? row.id + " · " : ""}{row.type || "Type unknown"}</small>
          </div>
          <div className="availability-track availability-busy" role="cell"
            aria-label={row.free_slots?.length ? undefined : "Unavailable throughout this window"}>
            {hours.slice(1).map(hour => <span className="availability-hour" aria-hidden="true" key={hour} style={{ left: percent(hour) }} />)}
            {row.free_slots?.map(slot => {
              const range = `${slot.start}–${slot.end}`;
              const style = { left: percent(minutes(slot.start)), right: `${100 - (minutes(slot.end) - start) / width * 100}%` };
              const label = `${row.id}, free ${range}`;
              const details = minutes(slot.end) - minutes(slot.start) >= width / 6 ? range : "";
              return reserve && row.type === "workstation"
                ? <button key={slot.start} type="button" className="availability-block availability-free" style={style}
                    aria-label={`Select ${label}`} title={label} onClick={() => reserve(row.id, slot)}>{details}</button>
                : <span key={slot.start} className="availability-block availability-free" style={style}
                    title={label}><span className={details ? undefined : "availability-visually-hidden"}>{details || label}</span></span>;
            })}
          </div>
        </div>)}
      </div>
    </div>
  </>;
}
