import test from 'node:test';
import assert from 'node:assert/strict';
import { validateE2EEnvironment } from './e2e-preflight.mjs';
import { productionRef } from './test-target-safety.mjs';
const ref='abcdefghijklmnopqrst';
const token = (extra={}) => 'header.'+Buffer.from(JSON.stringify({iss:`https://${ref}.supabase.co/auth/v1`,role:'authenticated',sub:'synthetic-user',exp:Date.now()/1000+3600,...extra})).toString('base64url')+'.signature';
const env={ E2E_BASE_URL:'http://127.0.0.1:8080', TEST_EXPECTED_PROJECT_REF:ref,
 TEST_SUPABASE_URL:`https://${ref}.supabase.co`,TEST_SUPABASE_ANON_KEY:'synthetic-key', VITE_SUPABASE_PROJECT_ID:ref,
 VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_PUBLISHABLE_KEY:'synthetic-key',
 LOVABLE_BROWSER_AUTH_STATUS:'injected',LOVABLE_BROWSER_SUPABASE_STORAGE_KEY:`sb-${ref}-auth-token`,
 LOVABLE_BROWSER_SUPABASE_SESSION_JSON:JSON.stringify({access_token:token()}),
 SUPABASE_DB_URL:`postgres://postgres:synthetic@db.${ref}.supabase.co/postgres` };
test('accepts explicit staging and local preview',()=>assert.doesNotThrow(()=>validateE2EEnvironment(env)));
for(const [label,change] of Object.entries({
 missingSession:{LOVABLE_BROWSER_SUPABASE_SESSION_JSON:''}, production:{TEST_EXPECTED_PROJECT_REF:productionRef},
 wrongBuild:{VITE_SUPABASE_URL:`https://${productionRef}.supabase.co`}, wrongKey:{VITE_SUPABASE_PUBLISHABLE_KEY:'other'},
 remotePreview:{E2E_BASE_URL:'https://aveto360.com'}, previewAuth:{E2E_BASE_URL:'http://u:p@localhost:8080'},
 foreignDatabase:{SUPABASE_DB_URL:`postgres://postgres:x@db.${productionRef}.supabase.co/postgres`},
 databaseOptions:{SUPABASE_DB_URL:env.SUPABASE_DB_URL+'?options=unsafe'}, alternateRoute:{PGHOSTADDR:'127.0.0.1'},
 alternateQA:{QA_DB_URL:env.SUPABASE_DB_URL}, cookies:{LOVABLE_BROWSER_SUPABASE_COOKIES_JSON:'[]'},
 expired:{LOVABLE_BROWSER_SUPABASE_SESSION_JSON:JSON.stringify({access_token:token({exp:1})})},
 foreignSession:{LOVABLE_BROWSER_SUPABASE_SESSION_JSON:JSON.stringify({access_token:token({iss:`https://${productionRef}.supabase.co/auth/v1`})})},
 storage:{LOVABLE_BROWSER_SUPABASE_STORAGE_KEY:'other'},
})) test('rejects '+label,()=>assert.throws(()=>validateE2EEnvironment({...env,...change})));
