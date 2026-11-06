import { describe,it,expect } from "vitest";
import { parsePublicationCsv,deriveResources,validatePublication } from "../publishedTimetable";
const header="entry_id,day,start_time,end_time,branch,semester,section,batch,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students,room_type,room_capacity";
const line=(id:string,semester:string,room="R1",faculty="AK",capacity="60",type="classroom")=>`${id},Mon,09:00,10:00,CSE-AI,${semester},A,,C1,Example,theory,${faculty},Faculty,${room},50,${type},${capacity}`;
describe("CSV resources and multi-semester timetable",()=>{
 it("extracts deduplicated resource metadata without manufacturing capacity",()=>{
  const rows=parsePublicationCsv(`${header}\n${line("1","1")}\n${line("2","3","R2","SV","")}`);
  expect(deriveResources(rows)).toHaveLength(2);expect(deriveResources(rows)[1].capacity).toBeNull();
 });
 it("separates students in different semesters but shares faculty and rooms",()=>{
  const rows=parsePublicationCsv(`${header}\n${line("1","1")}\n${line("2","7","R2","SV")}`);
  expect(validatePublication(rows)).toEqual([]);
  rows[1].faculty_id="AK";expect(validatePublication(rows)).toHaveLength(1);
  rows[1].room_id="R1";expect(validatePublication(rows)).toHaveLength(2);
 });
 it("checks explicit capacity and rejects contradictory room metadata",()=>{
  const rows=parsePublicationCsv(`${header}\n${line("1","5","R1","AK","20")}\n${line("2","3","R1","SV","60")}`);
  expect(validatePublication(rows).some(f=>f.includes("inconsistent"))).toBe(true);
  expect(validatePublication(rows).some(f=>f.includes("exceed"))).toBe(true);
 });
});
