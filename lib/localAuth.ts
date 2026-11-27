import { randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { KNOWN_STUDENTS, STAFF_ACCOUNTS, STAFF_PASSWORD, isUsn, normalizeUsn, type StaffRole } from "./demoFaculty";
export type Identity={id:string;name:string;role:"admin"|"hod"|"faculty"|"student";facultyId?:string;semester?:number;section?:string;batch?:string};
type Account=Identity&{salt?:string;hash?:string};
type StudentDefaults={semester:number;section:string;batch:string};
type Config={secret:string;accounts:Account[];studentDefaults?:StudentDefaults};
const directory=path.join(process.cwd(),'data','local-publication');
const file=path.join(directory,'review-auth.json');
const DEFAULT_STUDENT:StudentDefaults={semester:5,section:'A',batch:'A1'};

/** Holds the session-signing secret (and any staff added later). Passwords are not stored here any more. */
export function authConfig():Config {
 const hosted = process.env.CAMPUS_AUTH_CONFIG_JSON;
 if (hosted) {
  const config = JSON.parse(hosted) as Config;
  if (!config.secret || !Array.isArray(config.accounts)) throw new Error('Invalid hosted account configuration');
  return config;
 }
 if (process.env.VERCEL) throw new Error('Hosted account configuration is missing');
 if(!existsSync(file)){
  mkdirSync(directory,{recursive:true});
  const config:Config={secret:randomBytes(32).toString('hex'),accounts:[]};
  try {writeFileSync(file,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});}catch(e){if(!existsSync(file))throw e;}
 }
 return JSON.parse(readFileSync(file,'utf8'));
}

const strip=({hash,salt,...user}:Account):Identity=>user;

function staffAccount(config:Config,id:string):Identity|null{
 const builtIn=STAFF_ACCOUNTS.find(a=>a.id===id);
 if(builtIn)return {...builtIn};
 const extra=config.accounts.find(a=>a.id===id&&a.role!=='student');
 return extra?strip(extra):null;
}

export function studentIdentity(usn:unknown,config:Config=authConfig()):Identity|null{
 const id=normalizeUsn(usn);
 if(!isUsn(id))return null;
 const d=config.studentDefaults||DEFAULT_STUDENT;
 return {id,name:KNOWN_STUDENTS[id]||id,role:'student',semester:d.semester,section:d.section,batch:d.batch};
}

export function signSession(user:Identity){const payload=Buffer.from(JSON.stringify({id:user.id,expires:Date.now()+8*3600000})).toString('base64url');return payload+'.'+createHmac('sha256',authConfig().secret).update(payload).digest('base64url');}
export function identityFromCookie(cookie:string):Identity|null{
 try{const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('sc_session='))?.slice(11);if(!token)return null;const [payload,signature]=token.split('.');const config=authConfig();const expected=createHmac('sha256',config.secret).update(payload).digest();const received=Buffer.from(signature,'base64url');if(received.length!==expected.length||!timingSafeEqual(expected,received))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());if(data.expires<Date.now())return null;return studentIdentity(data.id,config)||staffAccount(config,String(data.id));}catch{return null;}
}

/** Staff sign-in: a listed faculty / HOD / admin ID with the shared password. */
export function authenticateStaff(role:unknown,id:unknown,password:unknown):Identity|null{
 if(typeof password!=='string'||password!==STAFF_PASSWORD)return null;
 const user=staffAccount(authConfig(),String(id??'').trim().toUpperCase());
 return user&&user.role===role?user:null;
}

export function provisionStaff(id:string,name:string,role:Exclude<StaffRole,'admin'>){
 if (process.env.CAMPUS_AUTH_CONFIG_JSON) throw new Error('Hosted accounts are configured by the deployment administrator');
 const config=authConfig();if(STAFF_ACCOUNTS.some(a=>a.id===id)||config.accounts.some(a=>a.id===id))throw new Error('Account already exists.');
 config.accounts.push({id,name,role,...(role==='faculty'?{facultyId:id}:{})});
 writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});return {id,password:STAFF_PASSWORD};
}
/** Sets the semester / section / batch every student USN signs in with. */
export function mapStudents(semester:number,section:string,batch:string){if(process.env.CAMPUS_AUTH_CONFIG_JSON)throw new Error('Hosted student mappings are configured by the deployment administrator');const config=authConfig();config.studentDefaults={semester,section,batch};writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});}
