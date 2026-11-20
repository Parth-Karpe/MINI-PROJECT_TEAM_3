"use client";
import { DAYS, minutes, validatePublication, type PublishedSession } from "@/lib/publishedTimetable";
const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const label = (n: number) => `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
export function WeeklyTimetable({ rows, visibleDay }: { rows: PublishedSession[]; visibleDay?: string }) {
  if (!rows.length) return <p className="rd-empty">No matching sessions. Check the account mapping or upload a timetable.</p>;
  const groups = [...new Set(rows.map(r => `${r.semester}:${r.section}`))].sort();
  const findings = validatePublication(rows);
  return <>{groups.map(group => {
    const [semester, section] = group.split(":");
    const sessions = rows.filter(r => r.semester===semester && r.section===section);
    const bounds = [...new Set([480,540,600,615,675,735,750,810,870,930,945,1005,1020,...sessions.flatMap(r => [minutes(r.start_time),minutes(r.end_time)])])].sort((a,b)=>a-b);
    return <div className="weekly-sheet" key={group}><h3>CSE (AI) · Semester {semester} · Division {section}</h3><p>{visibleDay?'Selected teaching day':'Weekly timetable'} · Faculty IDs in brackets · Room and batch below each course</p><div className="rd-table-wrap"><table className="weekly-grid"><thead><tr><th>Day / Time</th>{bounds.slice(0,-1).map((b,i)=><th key={b}>{label(b)}<br/>{label(bounds[i+1])}</th>)}</tr></thead><tbody>{DAYS.flatMap((day,di)=>{
      if(visibleDay && day!==visibleDay)return [];
      const dayRows=sessions.filter(r=>r.day===day).sort((a,b)=>minutes(a.start_time)-minutes(b.start_time));
      const lanes: PublishedSession[][]=[];
      for(const row of dayRows){let lane=lanes.find(l=>minutes(l[l.length-1].end_time)<=minutes(row.start_time));if(!lane){lane=[];lanes.push(lane);}lane.push(row);}
      if(!lanes.length)lanes.push([]);
      return lanes.map((lane,li)=>{
        const cells: React.ReactNode[]=[]; let i=0;
        while(i<bounds.length-1){
          const row=lane.find(r=>minutes(r.start_time)===bounds[i]);
          if(row){const end=bounds.indexOf(minutes(row.end_time));const conflict=findings.some(f=>f.split(":")[0].split(" (")[0].split(" / ").includes(row.entry_id));cells.push(<td key={i} colSpan={end-i} className={conflict?"weekly-conflict":"weekly-session"}><strong>{row.course_code}</strong><div>{row.course_name}</div><small>({row.faculty_id}) · {row.room_id}<br/>{row.batch || "Whole section"} · {row.session_type}<br/>{row.start_time}–{row.end_time}</small></td>);i=end;}
          else{const b=bounds[i];const pause=(b>=600&&b<615)||(b>=750&&b<810)||(b>=930&&b<945);cells.push(<td key={i} className={pause?"weekly-break":"weekly-free"}>{pause?(b>=750&&b<810?"Lunch":"Break"):""}</td>);i++;}
        }
        return <tr key={`${day}-${li}`}>{li===0&&<th rowSpan={lanes.length}>{names[di]}</th>}{cells}</tr>;
      });
    })}</tbody></table></div></div>;
  })}</>;
}
