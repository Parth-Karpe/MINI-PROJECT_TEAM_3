import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStaffCsv, mergeStaff } from "../staffRegistry";
import { EMPTY_PUBLICATION, type PublicationState } from "../publishedTimetable";
const memory=vi.hoisted(()=>({state:null as PublicationState|null}));
vi.mock("../publicationStore",()=>({readPublication:()=>structuredClone(memory.state),savePublication:(s:PublicationState)=>{memory.state=structuredClone(s);}}));
vi.mock("../localAuth",()=>({identityFromCookie:(cookie:string)=>cookie?JSON.parse(cookie):null,provisionStaff:vi.fn(),mapStudent:vi.fn()}));
vi.mock("../workflowBridge",()=>({workflowCall:async(actor:{role:string},action:string)=>{
 if(action==='publish')return {ok:true};
 const approved=memory.state?.approved;const all=approved?.rows||[];
 const rows=actor.role==='student'?all.filter(r=>r.semester==='5'&&r.section==='A'&&(!r.batch||r.batch==='A1')):actor.role==='faculty'?all.filter(r=>r.faculty_id==='AK'):all;
 return {draft:memory.state?.draft,published:!!approved,approved_info:approved,weekly_rows:rows,weekly_occupancy:all,resources:[]};
}}));
import { GET, POST } from "../../app/api/publication/route";
const post=(body:object)=>POST(new Request('http://localhost/api/publication',{method:'POST',body:JSON.stringify(body),headers:{cookie:JSON.stringify({id:'TEST',role:(body as {role:string}).role})}}));
beforeEach(()=>{memory.state=structuredClone(EMPTY_PUBLICATION);});
describe('Admin staff CSV registration',()=>{
 it('supports ID-only, role-specific headers and quoted names',()=>{
  expect(parseStaffCsv('id\nak\nsv\n','faculty')[0]).toEqual({id:'AK',name:'AK',role:'faculty'});
  expect(parseStaffCsv('hod_id,name\nHOD-CSAI,"Head, Department"','hod')[0].name).toBe('Head, Department');
 });
 it('rejects duplicate IDs and malformed rows before any save',()=>{
  expect(()=>parseStaffCsv('id\nAK\nak','faculty')).toThrow('Duplicate');
  expect(()=>parseStaffCsv('id\nbad id','faculty')).toThrow('invalid');
  expect(()=>parseStaffCsv('id,name\nAK','faculty')).toThrow('column count');
 });
 it('is idempotent, preserves existing names and blocks role changes',()=>{
  const existing=parseStaffCsv('id,name\nAK,Amit K','faculty');
  expect(mergeStaff(existing,parseStaffCsv('id\nAK','faculty'))).toEqual(existing);
  expect(()=>mergeStaff(existing,parseStaffCsv('id\nAK','hod'))).toThrow('cannot change roles');
 });
 it('previews without persisting and imports only for the admin demo role',async()=>{
  const body={role:'admin',action:'staff-preview',staffRole:'faculty',csv:'id,name\nAK,Amit K'};
  expect((await post(body)).status).toBe(200);expect(memory.state!.staff).toBeUndefined();
  expect((await post({...body,action:'staff-import',role:'faculty'})).status).toBe(403);
  expect((await post({...body,action:'staff-import'})).status).toBe(200);
  expect(memory.state!.staff).toHaveLength(1);
  const student=await(await GET(new Request('http://localhost/api/publication?role=student',{headers:{cookie:JSON.stringify({id:'PARTH',role:'student'})}}))).json();
  expect(student.staff).toBeUndefined();
 });
});
