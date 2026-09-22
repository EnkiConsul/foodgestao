import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=import.meta.dirname, ref='utjhzpdbqzajrhnzcher';
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'../f01/fixture.json'),'utf8'));
const cfg=JSON.parse(fs.readFileSync(path.resolve(dir,'../../../../implementacao-l01/homologacao/connection.json'),'utf8').replace(/^\uFEFF/,''));
const creds=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'Aveto360/homologacao/credentials.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(cfg.projectRef,ref);assert.equal(creds.projectRef,ref);assert.equal(fixture.projectRef,ref);
assert.equal(cfg.url,'https://'+ref+'.supabase.co');
const tokens={};
for(const label of ['a','d','b']){
 const u=creds.users.find(x=>x.email==='l01-'+label+'@example.invalid');
 const r=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',redirect:'error',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});
 assert.equal(r.status,200);tokens[label]=(await r.json()).access_token;
}
async function req(method,resource,body,who='a'){
 const headers={apikey:cfg.anonKey,'Content-Type':'application/json',Prefer:'return=representation'};
 if(who!=='anon')headers.Authorization='Bearer '+tokens[who];
 const r=await fetch(cfg.url+'/rest/v1/'+resource,{method,headers,redirect:'error',body:body===undefined?undefined:JSON.stringify(body)});
 const txt=await r.text();let data;try{data=JSON.parse(txt)}catch{data=txt}
 return {status:r.status,data};
}
const results=[], titles=[];
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data}
function denied(r){assert.ok([400,401,403,409].includes(r.status),JSON.stringify(r));}
async function create(amount=100){const r=await req('POST','transactions',{user_id:fixture.userA,company_id:fixture.companyA,context:'pj',account_id:fixture.accountA,transaction_type:'saida',amount,status:'pendente',amount_paid:0,transaction_date:'2026-09-22',due_date:'2026-09-22',description:'F02 SYNTHETIC'});const t=ok(r,201)[0];titles.push(t.id);return t.id;}
function payment(id,amount,key=crypto.randomUUID(),extra={}){return {_transaction_id:id,_amount:amount,_paid_on:'2026-09-22',_account_id:fixture.accountA,_idempotency_key:key,...extra};}
const pay=p=>req('POST','rpc/record_transaction_payment',p);
const reverse=(id,pid,key=crypto.randomUUID())=>req('POST','rpc/reverse_transaction_payment',{_transaction_id:id,_payment_id:pid,_paid_on:'2026-09-22',_idempotency_key:key,_reason:'Estorno sintético F02'});
async function balance(account=fixture.accountA){return Number(ok(await req('GET','accounts?id=eq.'+account+'&select=current_balance'))[0].current_balance);}
async function title(id){return ok(await req('GET','transactions?id=eq.'+id))[0];}
try{
 const start=await balance();assert.equal(start,0);
 const id=await create(), request=payment(id,40);let receipt;
 await test('partial_40_debits_40',async()=>{receipt=ok(await pay(request));assert.equal(receipt.amount_paid,40);assert.equal(await balance(),-40);assert.equal((await title(id)).status,'pendente');});
 await test('idempotent_retry',async()=>{const p=ok(await pay(request));assert.equal(p.payment_id,receipt.payment_id);assert.equal(p.replayed,true);assert.equal(await balance(),-40);});
 await test('idempotency_payload_conflict',async()=>denied(await pay({...request,_amount:41})));
 await test('description_edit_preserves_payment',async()=>{ok(await req('PATCH','transactions?id=eq.'+id,{description:'F02 edited'}));assert.equal((await title(id)).amount_paid,40);assert.equal(await balance(),-40);});
 await test('direct_payment_reset_denied',async()=>denied(await req('PATCH','transactions?id=eq.'+id,{amount_paid:0,payment_date:null})));
 await test('direct_status_confirmation_denied',async()=>denied(await req('PATCH','transactions?id=eq.'+id,{status:'confirmado'})));
 await test('amount_below_paid_denied',async()=>denied(await req('PATCH','transactions?id=eq.'+id,{amount:39})));
 await test('cancel_paid_denied',async()=>denied(await req('PATCH','transactions?id=eq.'+id,{status:'cancelado'})));
 await test('cross_company_cash_account_denied',async()=>denied(await pay(payment(id,10,undefined,{_account_id:fixture.accountB}))));
 await test('unauthorized_actor_denied',async()=>denied(await req('POST','rpc/record_transaction_payment',payment(id,10),'b')));
 await test('anonymous_denied',async()=>denied(await req('POST','rpc/record_transaction_payment',payment(id,10),'anon')));
 await test('concurrent_30_plus_30',async()=>{const r=await Promise.all([pay(payment(id,30)),pay(payment(id,30))]);r.forEach(x=>ok(x));assert.equal((await title(id)).amount_paid,100);assert.equal(await balance(),-100);});
 await test('overpayment_denied',async()=>denied(await pay(payment(id,1))));
 await test('client_cannot_invoke_privileged_recompute',async()=>denied(await req('POST','rpc/recompute_account_balance',{_account_id:fixture.accountA})));
 const rkey=crypto.randomUUID();
 await test('reverse_partial_restores_40',async()=>{const p=ok(await reverse(id,receipt.payment_id,rkey));assert.equal(p.amount_paid,60);assert.equal(await balance(),-60);assert.equal((await title(id)).status,'pendente');});
 await test('reverse_retry_no_double_credit',async()=>{assert.equal(ok(await reverse(id,receipt.payment_id,rkey)).replayed,true);assert.equal(await balance(),-60);});
 await test('second_reversal_denied',async()=>denied(await reverse(id,receipt.payment_id)));
 await test('payment_replay_after_reversal_no_repayment',async()=>{assert.equal(ok(await pay(request)).replayed,true);assert.equal(await balance(),-60);});
 await test('history_cannot_be_deleted',async()=>denied(await req('DELETE','transaction_payments?id=eq.'+receipt.payment_id)));
 await test('title_history_cannot_be_deleted',async()=>denied(await req('DELETE','transactions?id=eq.'+id)));
 const id2=await create(), concurrent=payment(id2,60);
 await test('concurrent_overpayment_only_one_commits',async()=>{const r=await Promise.all([pay(concurrent),pay(payment(id2,60))]);assert.equal(r.filter(x=>x.status===200).length,1);assert.equal((await title(id2)).amount_paid,60);});
 const id3=await create(), same=payment(id3,25);
 await test('concurrent_same_key_one_payment',async()=>{const r=await Promise.all([pay(same),pay(same)]);const a=ok(r[0]),b=ok(r[1]);assert.equal(a.payment_id,b.payment_id);assert.equal((await title(id3)).amount_paid,25);});
 await test('different_same_company_cash_account',async()=>{ok(await pay(payment(id3,15,undefined,{_account_id:fixture.accountA2})));assert.equal(await balance(fixture.accountA2),-15);});
 await test('viewer_cannot_pay_company_B',async()=>{const r=await req('POST','transactions',{user_id:fixture.userD,company_id:fixture.companyB,context:'pj',account_id:fixture.accountB,transaction_type:'saida',amount:100,status:'pendente',transaction_date:'2026-09-22',description:'F02 B SYNTHETIC'},'d');const tid=ok(r,201)[0].id;try{denied(await pay(payment(tid,10,undefined,{_account_id:fixture.accountB})));}finally{ok(await req('DELETE','transactions?id=eq.'+tid,undefined,'d'));}});
 await test('client_cannot_invoke_privileged_drift_report',async()=>denied(await req('POST','rpc/report_balance_drift',{})));
 await test('outsider_cannot_read_payment_history',async()=>{const r=ok(await req('GET','transaction_payments?transaction_id=eq.'+id,undefined,'b'));assert.equal(r.length,0);});
 await test('direct_ledger_insert_denied',async()=>denied(await req('POST','transaction_payments',{transaction_id:id,account_id:fixture.accountA,amount:1,paid_on:'2026-09-22',idempotency_key:crypto.randomUUID(),created_by:fixture.userA})));
 await test('nonpositive_and_fractional_cent_denied',async()=>{for(const value of [0,-1,0.001])denied(await pay(payment(id3,value)));});
 await test('income_personal_partial_and_reversal',async()=>{
  const tid=ok(await req('POST','transactions',{user_id:fixture.userA,company_id:null,context:'pf',account_id:fixture.personalA,transaction_type:'entrada',amount:100,status:'pendente',transaction_date:'2026-09-22',description:'F02 PF SYNTHETIC'}),201)[0].id;
  titles.push(tid);
  const p=ok(await pay(payment(tid,40,undefined,{_account_id:fixture.personalA})));
  assert.equal(await balance(fixture.personalA),40);
  denied(await pay(payment(tid,10,undefined,{_account_id:fixture.personalD})));
  ok(await reverse(tid,p.payment_id));assert.equal(await balance(fixture.personalA),0);
 });
 await test('legacy_confirmed_cannot_become_untracked_partial',async()=>{
  const tid=ok(await req('POST','transactions',{user_id:fixture.userA,company_id:fixture.companyA,context:'pj',account_id:fixture.accountA,transaction_type:'saida',amount:100,amount_paid:100,status:'confirmado',transaction_date:'2026-09-22',description:'F02 legacy SYNTHETIC'}),201)[0].id;
  try{denied(await req('PATCH','transactions?id=eq.'+tid,{status:'pendente',amount_paid:40}));}
  finally{ok(await req('DELETE','transactions?id=eq.'+tid));}
 });
}finally{
 for(const id of titles){
  const history=ok(await req('GET','transaction_payments?transaction_id=eq.'+id));
  const reversed=new Set(history.map(p=>p.reversal_of));
  for(const p of history.filter(p=>!p.reversal_of&&!reversed.has(p.id)))ok(await reverse(id,p.id));
  ok(await req('PATCH','transactions?id=eq.'+id,{status:'cancelado'}));
 }
 await test('cleanup_reverses_all_cash_and_preserves_history',async()=>{assert.equal(await balance(),0);assert.equal(await balance(fixture.accountA2),0);for(const id of titles){assert.equal((await title(id)).amount_paid,0);assert.equal((await title(id)).status,'cancelado');}});
 const report={at:new Date().toISOString(),projectRef:ref,tests:results.length,passed:results.filter(x=>x.passed).length,results,titles};
 fs.writeFileSync(path.join(dir,'rest-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(x=>!x.passed))process.exitCode=1;
}
