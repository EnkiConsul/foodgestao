import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createE2ESession, writeActionsSession} from './e2e-session.mjs';
const ref='abcdefghijklmnopqrst';
const env={E2E_BASE_URL:'http://127.0.0.1:8080',TEST_EXPECTED_PROJECT_REF:ref,
 TEST_SUPABASE_URL:`https://${ref}.supabase.co`,TEST_SUPABASE_ANON_KEY:'synthetic',
 VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_PROJECT_ID:ref,VITE_SUPABASE_PUBLISHABLE_KEY:'synthetic',
 SUPABASE_DB_URL:`postgres://postgres:synthetic@db.${ref}.supabase.co/postgres`,
 TEST_USER_A_EMAIL:'test@example.invalid',TEST_USER_A_PASSWORD:'synthetic-password'};
const session=(extra={})=>({access_token:'h.'+Buffer.from(JSON.stringify({iss:`https://${ref}.supabase.co/auth/v1`,role:'authenticated',sub:'user',exp:Date.now()/1000+3600,...extra})).toString('base64url')+'.s',refresh_token:'synthetic-refresh',user:{id:'user'}});
const response=data=>({ok:true,json:async()=>data});
test('fresh login uses validated destination and disables redirects',async()=>{
 const updates=await createE2ESession(env,async(url,options)=>{
  assert.equal(url,`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`);
  assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body),{email:env.TEST_USER_A_EMAIL,password:env.TEST_USER_A_PASSWORD});
  return response(session());
 });
 assert.equal(updates.LOVABLE_BROWSER_AUTH_STATUS,'injected');
 assert.equal(updates.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY,`sb-${ref}-auth-token`);
});
for(const change of [{VITE_SUPABASE_URL:'https://other.invalid'},{TEST_USER_A_PASSWORD:''},{SUPABASE_DB_URL:'postgres://postgres:x@other.invalid/postgres'}]) {
 test('invalid prerequisites cannot transmit credentials '+Object.keys(change)[0],async()=>{
 let calls=0; await assert.rejects(createE2ESession({...env,...change},async()=>{calls++;return response(session());})); assert.equal(calls,0);
 });
}
test('login rejection does not reveal response body',async()=>{
 await assert.rejects(createE2ESession(env,async()=>({ok:false,json:()=>{throw Error('must not parse');}})),/recusada/);
});
for(const [name,data] of Object.entries({expired:session({exp:1}),foreign:session({iss:'https://other.invalid/auth/v1'}),wrongIdentity:{...session(),user:{id:'other'}},noRefresh:{...session(),refresh_token:null}})) {
 test('rejects invalid session '+name,async()=>assert.rejects(createE2ESession(env,async()=>response(data))));
}
test('writes job session only after registering masks',async()=>{
 const updates=await createE2ESession(env,async()=>response(session()));
 const path=join(mkdtempSync(join(tmpdir(),'e2e-session-')),'env');const logs=[];
 writeActionsSession(updates,path,line=>logs.push(line));
 assert.equal(logs.length,3);assert.ok(logs.every(l=>l.startsWith('::add-mask::')));
 const content=readFileSync(path,'utf8');assert.ok(content.includes('LOVABLE_BROWSER_SUPABASE_SESSION_JSON='));
 assert.ok(!content.includes(env.TEST_USER_A_PASSWORD));
});
