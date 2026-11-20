import {afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../../middleware';
afterEach(()=>vi.unstubAllGlobals());
describe('Review route access',()=>{
 it('allows a real same-host mutation when Next normalizes its URL hostname',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({user:{id:'ADMIN',role:'admin'}}))));
  const request=new NextRequest('http://localhost:3100/api/publication',{method:'POST',headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}});
  expect((await middleware(request)).status).toBe(200);
 });
 it('blocks foreign origins and unauthenticated API requests',async()=>{
  const foreign=new NextRequest('http://localhost:3100/api/publication',{method:'POST',headers:{host:'localhost:3100',origin:'http://attacker.invalid'}});
  expect((await middleware(foreign)).status).toBe(403);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401})));
  expect((await middleware(new NextRequest('http://localhost/api/workflow'))).status).toBe(401);
 });
 it('prevents a student opening admin tools or another dashboard',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({user:{id:'PARTH',role:'student'}})))));
  expect((await middleware(new NextRequest('http://localhost/api/resources'))).status).toBe(403);
  const response=await middleware(new NextRequest('http://localhost/dashboards/hod'));
  expect(response.headers.get('location')).toBe('http://localhost/dashboards/student');
 });
});
