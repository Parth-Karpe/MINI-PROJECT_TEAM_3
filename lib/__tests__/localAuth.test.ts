import {describe,it,expect,vi} from 'vitest';
const files=vi.hoisted(()=>new Map<string,string>());
vi.mock('node:fs',()=>({existsSync:(p:string)=>files.has(p),mkdirSync:()=>{},readFileSync:(p:string)=>{if(!files.has(p))throw new Error('missing');return files.get(p);},writeFileSync:(p:string,s:string)=>files.set(p,String(s))}));
import {authConfig,authenticate,identityFromCookie,signSession} from '../localAuth';
describe('Local authenticated review accounts',()=>{
 it('uses salted hashes and never accepts ID alone',()=>{
  const config=authConfig();expect(config.accounts.every(a=>a.hash.length===128&&a.salt.length===32)).toBe(true);
  expect(authenticate('AK','')).toBeNull();
  const credentials=[...files.entries()].find(([p])=>p.endsWith('REVIEW_CREDENTIALS.txt'))![1];
  const password=credentials.split('\n').find(s=>s.startsWith('AK: '))!.slice(4);
  expect(authenticate('AK',password)?.facultyId).toBe('AK');
 });
 it('rejects forged and altered session cookies',()=>{
  const token=signSession({id:'AK',name:'Amit',role:'faculty',facultyId:'AK'});
  expect(identityFromCookie('sc_session='+token)?.role).toBe('faculty');
  const [payload,sig]=token.split('.');
  const forged=Buffer.from(JSON.stringify({id:'ADMIN',expires:Date.now()+10000})).toString('base64url');
  expect(identityFromCookie(`sc_session=${forged}.${sig}`)).toBeNull();
  expect(identityFromCookie(`sc_session=${payload}.invalid`)).toBeNull();
 });
});
