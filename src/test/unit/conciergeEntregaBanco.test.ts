// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
  CREATE FUNCTION public.is_super_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT u='${id(1)}'::uuid $$;
  CREATE TABLE concierge_provisionamentos(company_id uuid PRIMARY KEY,modo text,criado_por uuid,modulos text[],parametrizacao_concluida_em timestamptz);
  CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,status_tenant text,trial_termina_em timestamptz);
  CREATE TABLE company_modules(id uuid,company_id uuid,module text,status text,ends_at timestamptz,trial_termina_em timestamptz);
  CREATE TABLE subscriptions(id uuid,module text,status text,trial_ends_at timestamptz,current_period_end timestamptz);
  CREATE TABLE subscription_companies(subscription_id uuid,company_id uuid,removed_at timestamptz);
  CREATE TABLE trial_usage(subscription_id uuid,ends_at timestamptz);
  CREATE TABLE company_members(company_id uuid,user_id uuid);
  CREATE TABLE dp_unidades(company_id uuid); CREATE TABLE dp_ficha_importacoes(company_id uuid);`);
  await db.exec(readFileSync("drizzle/migrations/0202_concierge_entrega_trial_opcional.sql","utf8"));
},30000);
afterAll(() => db.close());
async function preparar() {
  await db.exec(`TRUNCATE concierge_provisionamentos,companies,company_modules,subscriptions,subscription_companies,trial_usage,company_members;
  SET app.actor='${id(1)}';
  INSERT INTO concierge_provisionamentos(company_id,modo,criado_por,modulos) VALUES('${id(10)}','apoio','${id(1)}',ARRAY['dp']);
  INSERT INTO companies VALUES('${id(10)}','${id(2)}','trial',now()+interval '20 days');
  INSERT INTO company_modules VALUES('${id(20)}','${id(10)}','dp','trial',now()+interval '20 days',now()+interval '20 days');
  INSERT INTO subscriptions VALUES('${id(30)}','pessoas','trialing',now()+interval '20 days',now()+interval '20 days');
  INSERT INTO subscription_companies VALUES('${id(30)}','${id(10)}',NULL);
  INSERT INTO trial_usage VALUES('${id(30)}',now()+interval '20 days');
  INSERT INTO company_members VALUES('${id(10)}','${id(1)}'),('${id(10)}','${id(2)}');`);
}
const concluir = (modo: string) => db.query<{ r: unknown }>(`select admin_concierge_concluir_parametrizacao('${id(10)}',$1) r`,[modo]);
describe.sequential("Entrega atômica isolada", () => {
  it("manter não modifica datas de nenhuma fonte",async () => {
    await preparar();
    const sql = "select c.trial_termina_em::text c,m.trial_termina_em::text m,s.trial_ends_at::text s,t.ends_at::text t from companies c,company_modules m,subscriptions s,trial_usage t";
    const antes = (await db.query(sql)).rows;
    await concluir("manter"); expect((await db.query(sql)).rows).toEqual(antes);
  });
  it("reiniciar grava exatamente 7 dias nas fontes",async () => {
    await preparar(); await db.exec("BEGIN");
    try { await concluir("reiniciar_7d");
      expect((await db.query("select c.trial_termina_em=now()+interval '7 days' and m.ends_at=c.trial_termina_em and s.trial_ends_at=c.trial_termina_em and t.ends_at=c.trial_termina_em ok from companies c,company_modules m,subscriptions s,trial_usage t")).rows).toEqual([{ok:true}]);
    } finally { await db.exec("ROLLBACK"); }
  });
  it("somar adiciona exatamente 7 dias ao fim atual",async () => {
    await preparar(); const antes = (await db.query<{fim:Date}>("select trial_termina_em fim from companies")).rows[0].fim;
    await concluir("somar_7d"); const depois = (await db.query<{fim:Date}>("select trial_termina_em fim from companies")).rows[0].fim;
    expect(new Date(depois).getTime()-new Date(antes).getTime()).toBe(7*86400000);
  });
  it("repetir conclusão não renova nem muda o resumo",async () => {
    await preparar(); const a=await concluir("somar_7d"); const b=await concluir("somar_7d"); expect(b.rows).toEqual(a.rows);
  });
  it("retira apoio mas preserva o dono",async () => {
    await preparar(); await concluir("manter"); expect((await db.query("select user_id::text from company_members")).rows).toEqual([{user_id:id(2)}]);
  });
  it("nega ator sem super admin",async () => {
    await preparar(); await db.exec(`SET app.actor='${id(2)}'`); await expect(concluir("manter")).rejects.toThrow("sem_permissao");
  });
  it("recusa renovar assinatura compartilhada sem tocar outra empresa",async () => {
    await preparar(); await db.exec(`INSERT INTO subscription_companies VALUES('${id(30)}','${id(11)}',NULL)`); await expect(concluir("somar_7d")).rejects.toThrow("trial_compartilhado");
  });
  it("recusa modo desconhecido",async () => { await preparar(); await expect(concluir("automatico")).rejects.toThrow("modo_trial_invalido"); });
});