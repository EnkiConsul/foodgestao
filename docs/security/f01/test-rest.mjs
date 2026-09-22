import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=import.meta.dirname;
const mode=process.argv[2]??'post';
if(!['baseline','post'].includes(mode))throw Error('invalid mode');
const ref='utjhzpdbqzajrhnzcher';
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixture.json'),'utf8'));
const cfg=JSON.parse(fs.readFileSync(process.env.F01_CONNECTION_FILE??path.resolve(dir,'../../../../implementacao-l01/homologacao/connection.json'),'utf8').replace(/^\uFEFF/,''));
const creds=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'Aveto360/homologacao/credentials.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(fixture.projectRef,ref);assert.equal(cfg.projectRef,ref);assert.equal(creds.projectRef,ref);
assert.equal(cfg.url.replace(/\/$/,''),'https://'+ref+'.supabase.co');
const tokens={};
for(const [label,email,id] of [['a','l01-a@example.invalid',fixture.userA],['d','l01-d@example.invalid',fixture.userD],['b','l01-b@example.invalid',null]]){
 const u=creds.users.find(x=>x.email===email);assert.ok(u);
 const r=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',redirect:'error',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password:u.password})});
 if(!r.ok)throw Error('login failed '+r.status);
 const s=await r.json();assert.ok(s.access_token);if(id)assert.equal(s.user.id,id);
 tokens[label]=s.access_token;
}
const results=[];
async function req(method,resource,body,who='a'){
 const headers={apikey:cfg.anonKey,'Content-Type':'application/json',Prefer:'return=representation'};
 if(who!=='anon')headers.Authorization='Bearer '+tokens[who];
 const r=await fetch(cfg.url+'/rest/v1/'+resource,{method,redirect:'error',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:r.status,data};
}
const base={user_id:fixture.userA,company_id:fixture.companyA,context:'pj',account_id:fixture.accountA,transaction_type:'entrada',amount:7,status:'confirmado',transaction_date:'2026-09-22',description:'F01 SYNTHETIC '+mode};
async function check(name,expected,work){try{const detail=await work();results.push({name,expected,...detail});}catch(e){results.push({name,expected,passed:false,error:e.message});}}
async function insertion(name,patch,allowed,who='a'){
 await check(name,allowed?'allowed':'denied',async()=>{
  const id=crypto.randomUUID();
  const r=await req('POST','transactions',{...base,...patch,id},who);
  const success=r.status===201 && Array.isArray(r.data)&&r.data.length===1;
  let cleanup=true;
  if(success){const d=await req('DELETE','transactions?id=eq.'+id,undefined,who);cleanup=d.status===200&&d.data.length===1;}
  return {status:r.status,sqlstate:r.data?.code??null,passed:(allowed?success:([400,401,403,409].includes(r.status)&&['42501','23514','23503','23502'].includes(r.data?.code)))&&cleanup,cleanup};
 });
}
await check('viewer_can_read_company_B_account','read',async()=>{const r=await req('GET','accounts?id=eq.'+fixture.accountB+'&select=id,current_balance');return {status:r.status,passed:r.status===200&&r.data.length===1};});
await insertion('own_company_account',{},true);
await insertion('cross_company_source',{account_id:fixture.accountB},false);
await insertion('viewer_cannot_write_company_B',{company_id:fixture.companyB,account_id:fixture.accountB},false);
if(mode==='post'){
 await insertion('owner_D_company_B',{user_id:fixture.userD,company_id:fixture.companyB,account_id:fixture.accountB},true,'d');
 await insertion('non_member_company_A',{},false,'b');
 await insertion('anonymous_cannot_write',{},false,'anon');
 await insertion('own_personal_account',{context:'pf',company_id:null,account_id:fixture.personalA},true);
 await insertion('other_personal_account',{context:'pf',company_id:null,account_id:fixture.personalD},false);
 await insertion('personal_context_corporate_account',{context:'pf',company_id:null},false);
 await insertion('corporate_context_personal_account',{account_id:fixture.personalA},false);
 await insertion('personal_context_with_company',{context:'pf',account_id:fixture.personalA},false);
 await insertion('corporate_context_without_company',{company_id:null,account_id:fixture.personalA},false);
 await insertion('missing_account',{account_id:crypto.randomUUID()},false);
 await insertion('own_card',{account_id:null,credit_card_id:fixture.cardA,transaction_type:'saida'},true);
 await insertion('cross_company_card',{account_id:null,credit_card_id:fixture.cardB,transaction_type:'saida'},false);
 await insertion('own_personal_card',{context:'pf',company_id:null,account_id:null,credit_card_id:fixture.personalCardA,transaction_type:'saida'},true);
 await insertion('other_personal_card',{context:'pf',company_id:null,account_id:null,credit_card_id:fixture.personalCardD,transaction_type:'saida'},false);
 await insertion('corporate_context_personal_card',{account_id:null,credit_card_id:fixture.personalCardA,transaction_type:'saida'},false);
 await insertion('same_company_transfer',{transaction_type:'transferencia',destination_account_id:fixture.accountA2},true);
 await insertion('cross_company_transfer',{transaction_type:'transferencia',destination_account_id:fixture.accountB},false);
 await insertion('cross_company_transfer_source',{transaction_type:'transferencia',account_id:fixture.accountB,destination_account_id:fixture.accountA2},false);
 const id=crypto.randomUUID();const created=await req('POST','transactions',{...base,id});
 assert.equal(created.status,201);
 try{
  for(const [name,payload,allowed] of [
   ['edit_description',{description:'F01 SYNTHETIC edited'},true],
   ['change_same_company_account',{account_id:fixture.accountA2},true],
   ['update_cross_company_account',{account_id:fixture.accountB},false],
   ['update_cross_company_card',{account_id:null,credit_card_id:fixture.cardB},false],
   ['update_context_only',{context:'pf'},false],
   ['update_null_company',{company_id:null},false],
  ]){
   await check(name,allowed?'allowed':'denied',async()=>{const r=await req('PATCH','transactions?id=eq.'+id,payload);const good=allowed?r.status===200&&r.data.length===1:r.status===403&&r.data?.code==='42501'||r.status===400&&r.data?.code==='23514';return {status:r.status,sqlstate:r.data?.code??null,passed:good};});
  }
  await check('failed_updates_preserve_balance','A=0,A2=7,B=0',async()=>{const r=await req('GET','accounts?id=in.('+[fixture.accountA,fixture.accountA2,fixture.accountB].join(',')+')&select=id,current_balance');const m=new Map(r.data.map(x=>[x.id,Number(x.current_balance)]));return {status:r.status,passed:m.get(fixture.accountA)===0&&m.get(fixture.accountA2)===7&&m.get(fixture.accountB)===0};});
 }finally{const d=await req('DELETE','transactions?id=eq.'+id);assert.equal(d.status,200);assert.equal(d.data.length,1);}
 await check('batch_atomic_cross_company','all denied',async()=>{const ids=[crypto.randomUUID(),crypto.randomUUID()];const r=await req('POST','transactions',[{...base,id:ids[0]},{...base,id:ids[1],account_id:fixture.accountB}]);if(r.status===201)await req('DELETE','transactions?id=in.('+ids.join(',')+')');const after=await req('GET','transactions?id=in.('+ids.join(',')+')&select=id');return {status:r.status,sqlstate:r.data?.code??null,passed:r.status===403&&r.data?.code==='42501'&&after.status===200&&after.data.length===0};});
 for(const [name,table,id,payload,who] of [
  ['account_tenant_immutable','accounts',fixture.accountA,{company_id:fixture.companyB},'a'],
  ['account_context_immutable','accounts',fixture.accountA,{company_id:null,context:'pf'},'a'],
  ['personal_account_owner_immutable','accounts',fixture.personalA,{user_id:fixture.userD},'a'],
  ['card_tenant_immutable','credit_cards',fixture.cardA,{company_id:fixture.companyB},'a'],
  ['card_context_immutable','credit_cards',fixture.cardA,{company_id:null,context:'pf'},'a'],
  ['personal_card_owner_immutable','credit_cards',fixture.personalCardA,{user_id:fixture.userD},'a'],
 ]){
  await check(name,'denied',async()=>{const r=await req('PATCH',table+'?id=eq.'+id,payload,who);return {status:r.status,sqlstate:r.data?.code??null,passed:r.status===403&&r.data?.code==='42501'};});
 }
 await check('account_name_edit','allowed',async()=>{const r=await req('PATCH','accounts?id=eq.'+fixture.accountA,{name:'F01-A renamed'});return {status:r.status,sqlstate:r.data?.code,message:r.data?.message,passed:r.status===200&&r.data.length===1};});
 await check('card_limit_edit','allowed',async()=>{const r=await req('PATCH','credit_cards?id=eq.'+fixture.cardA,{credit_limit:2000});return {status:r.status,passed:r.status===200&&r.data.length===1};});
 await check('balance_engine_not_public','denied',async()=>{const r=await req('POST','rpc/apply_tx_balance',{_tx:{...base,account_id:fixture.accountB},_sign:1});return {status:r.status,sqlstate:r.data?.code??null,passed:[401,403,404].includes(r.status)&&['42501','PGRST202'].includes(r.data?.code)};});
 await check('fixture_balances_zero','zero',async()=>{const r=await req('GET','accounts?id=in.('+[fixture.accountA,fixture.accountA2,fixture.accountB,fixture.personalA].join(',')+')&select=current_balance');return {status:r.status,passed:r.status===200&&r.data.length===4&&r.data.every(x=>Number(x.current_balance)===0)};});
}
const report={at:new Date().toISOString(),mode,projectRef:ref,method:'HTTP REST with real synthetic logins; no production traffic',tests:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
fs.writeFileSync(path.join(dir,mode+'-rest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(mode==='post'&&report.failed)process.exitCode=1;
