const fs=require('fs');const ts=require('typescript');const Module=require('module');
const source=fs.readFileSync('lib/localAuth.ts','utf8');
const m=new Module(require('path').resolve('lib/localAuth.bootstrap.cjs'),module);
m.filename=require('path').resolve('lib/localAuth.bootstrap.cjs');m.paths=module.paths;
m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,m.filename);
const config=m.exports.authConfig();
console.log('Review accounts initialized: '+config.accounts.map(a=>a.id+' ('+a.role+')').join(', '));
console.log('Private initial passwords: '+require('path').resolve('data/local-publication/REVIEW_CREDENTIALS.txt'));
