import {authConfig,type Identity} from './localAuth';
export async function workflowCall(actor:Identity,action:string,payload:Record<string,unknown>={}){
 const base=(process.env.ALGORITHM_ENGINE_URL||'http://127.0.0.1:8000').replace(/\/+$/,'');
 const res=await fetch(base+'/workflow/action',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Key':authConfig().secret},body:JSON.stringify({actor,action,payload}),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const data=await res.json();if(!res.ok)throw new Error(data.detail||'Workflow backend failed');return data;
}
