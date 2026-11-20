import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export type Identity={id:string;name:string;role:"admin"|"hod"|"faculty"|"student";facultyId?:string;semester?:number;section?:string;batch?:string};
type Account=Identity&{salt:string;hash:string};
type Config={secret:string;accounts:Account[]};
const directory=path.join(process.cwd(),'data','local-publication');
const file=path.join(directory,'review-auth.json');
export function authConfig():Config {
 if(!existsSync(file)){
  mkdirSync(directory,{recursive:true});
  const users:Identity[]=[{id:'ADMIN',name:'Department Admin',role:'admin'},{id:'HOD-CSAI',name:'Department HOD',role:'hod'},{id:'AK',name:'Amit K',role:'faculty',facultyId:'AK'},{id:'SV',name:'Sneha V',role:'faculty',facultyId:'SV'},{id:'DK',name:'Dheeraj K',role:'faculty',facultyId:'DK'},{id:'PS',name:'Pooja S',role:'faculty',facultyId:'PS'},{id:'PARTH',name:'Parth Karpe',role:'student',semester:5,section:'A',batch:'A1'}];
  const passwords=users.map(u=>({id:u.id,password:randomBytes(12).toString('base64url')}));
  const config:Config={secret:randomBytes(32).toString('hex'),accounts:users.map((u,i)=>{const salt=randomBytes(16).toString('hex');return {...u,salt,hash:scryptSync(passwords[i].password,salt,64).toString('hex')};})};
  try {writeFileSync(file,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});writeFileSync(path.join(directory,'REVIEW_CREDENTIALS.txt'),'LOCAL REVIEW ACCOUNTS — DO NOT COMMIT OR SHARE PUBLICLY\n'+passwords.map(x=>`${x.id}: ${x.password}`).join('\n'),{mode:0o600});}catch(e){if(!existsSync(file))throw e;}
 }
 return JSON.parse(readFileSync(file,'utf8'));
}
export function signSession(user:Identity){const payload=Buffer.from(JSON.stringify({id:user.id,expires:Date.now()+8*3600000})).toString('base64url');return payload+'.'+createHmac('sha256',authConfig().secret).update(payload).digest('base64url');}
export function identityFromCookie(cookie:string):Identity|null{
 try{const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('sc_session='))?.slice(11);if(!token)return null;const [payload,signature]=token.split('.');const config=authConfig();const expected=createHmac('sha256',config.secret).update(payload).digest();const received=Buffer.from(signature,'base64url');if(received.length!==expected.length||!timingSafeEqual(expected,received))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());if(data.expires<Date.now())return null;const account=config.accounts.find(a=>a.id===data.id);if(!account)return null;const {hash,salt,...user}=account;return user;}catch{return null;}
}
export function authenticate(id:string,password:string):Identity|null{const account=authConfig().accounts.find(a=>a.id===id.toUpperCase());if(!account||password.length>200)return null;const supplied=scryptSync(password,account.salt,64);if(!timingSafeEqual(supplied,Buffer.from(account.hash,'hex')))return null;const {hash,salt,...user}=account;return user;}
export function provisionStaff(id:string,name:string,role:'faculty'|'hod'){
 const config=authConfig();if(config.accounts.some(a=>a.id===id))throw new Error('Account already exists.');
 const password=randomBytes(12).toString('base64url'),salt=randomBytes(16).toString('hex');
 config.accounts.push({id,name,role,...(role==='faculty'?{facultyId:id}:{}),salt,hash:scryptSync(password,salt,64).toString('hex')});
 writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});return {id,password};
}
export function mapStudent(id:string,semester:number,section:string,batch:string){const config=authConfig();const account=config.accounts.find(a=>a.id===id&&a.role==='student');if(!account)throw new Error('Student account not found');Object.assign(account,{semester,section,batch});writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});}
