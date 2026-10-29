// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "00000000-0000-4000-8000-000000000001", sol = "00000000-0000-4000-8000-000000000002", dest = "00000000-0000-4000-8000-000000000003", actor = "00000000-0000-4000-8000-000000000004", request = "00000000-0000-4000-8000-000000000005";
beforeAll(async () => {
  await db.exec(`CREATE SCHEMA private; CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.actor'',true),'''')::uuid';
  SELECT set_config('test.actor','${actor}',false);
  CREATE TABLE companies(id uuid,name text); INSERT INTO companies VALUES('${company}','Empresa');
  CREATE TABLE dp_colaboradores(id uuid,company_id uuid,nome text,origem_cadastro text,regime text,user_id uuid);
  INSERT INTO dp_colaboradores VALUES('${sol}','${company}','Hanna Civil','manual','clt','${sol}'),('${dest}','${company}','Verônica Civil','preadmissao_rotina','freelancer',null);
  CREATE TABLE dp_trocas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid,gestor_id uuid,status text);
  CREATE TABLE dp_documentos(id uuid DEFAULT gen_random_uuid(),colaborador_id uuid,file_path text,arquivado_em timestamptz,arquivado_por uuid,arquivamento_motivo text);
  CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $1=''${actor}''::uuid AND $2=''${company}''::uuid';
  CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
  CREATE FUNCTION private.dp_troca_gestor_validar(uuid,uuid,uuid,date,date) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"riscos":[],"em_admissao":true}''::jsonb';
  CREATE FUNCTION public.dp_troca_gestor_registrar(uuid,uuid,uuid,date,date,text,boolean,boolean) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE t uuid; BEGIN INSERT INTO dp_trocas(company_id,gestor_id,status) VALUES($1,auth.uid(),'aprovada') RETURNING id INTO t; RETURN jsonb_build_object('troca_id',t,'status','aprovada'); END $$;
  CREATE FUNCTION public.dp_documento_registrar(jsonb) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE d uuid; BEGIN IF current_setting('test.fail',true)='on' THEN RAISE EXCEPTION 'DOC_FAILURE'; END IF; INSERT INTO dp_documentos(colaborador_id,file_path) VALUES(($1->>'colaborador_id')::uuid,$1->>'file_path') RETURNING id INTO d; RETURN d; END $$;`);
  await db.exec(readFileSync("drizzle/migrations/0166_troca_gestor_termos_individuais.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
const files = () => [{ colaborador_id: sol, file_path: `${company}/${sol}/trocas/${request}/termo-alteracao-folga-2026-10-29.pdf`, file_size: 1200 }];
const register = (arquivos = files()) => db.query(`SELECT dp_troca_gestor_registrar_documentada($1,$2,$3,'2026-10-29','2026-11-02','Acordo informado',false,$4,$5::jsonb) v`, [company, sol, dest, request, JSON.stringify(arquivos)]);
describe.sequential("troca e documentos atômicos em banco isolado", () => {
  it("classifica por vínculo, não pelo acesso ao Portal", async () => {
    const r = await db.query<{ v: { formal: boolean; nome: string }[] }>(`SELECT private.dp_troca_gestor_participantes($1,$2,$3,'2026-10-29','2026-11-02') v`, [company, sol, dest]);
    expect(r.rows[0].v.map(p => [p.nome, p.formal])).toEqual([["Hanna Civil", true], ["Verônica Civil", false]]);
  });
  it("pré-admissão não assina mesmo com regime previsto formal", async () => {
    await db.exec(`BEGIN; UPDATE dp_colaboradores SET regime='clt' WHERE id='${dest}'`);
    const r = await db.query<{ v: { colaborador_id: string; formal: boolean }[] }>(`SELECT private.dp_troca_gestor_participantes($1,$2,$3,'2026-10-29','2026-11-02') v`, [company, sol, dest]);
    expect(r.rows[0].v.find(p => p.colaborador_id === dest)?.formal).toBe(false);
    await db.exec("ROLLBACK");
  });
  it("recusa outra empresa e usuário não gestor", async () => {
    await db.exec(`SELECT set_config('test.actor','${sol}',false)`);
    await expect(register()).rejects.toThrow("FORBIDDEN");
    await db.exec(`SELECT set_config('test.actor','${actor}',false)`);
  });
  it("documento faltante desfaz também a troca", async () => {
    await expect(register([])).rejects.toThrow("TROCA_TERMOS_DIVERGENTES");
    expect((await db.query("SELECT * FROM dp_trocas")).rows).toHaveLength(0);
  });
  it("falha documental não deixa troca aplicada", async () => {
    await db.exec("SELECT set_config('test.fail','on',false)");
    await expect(register()).rejects.toThrow("DOC_FAILURE");
    expect((await db.query("SELECT * FROM dp_trocas")).rows).toHaveLength(0);
    await db.exec("SELECT set_config('test.fail','off',false)");
  });
  it("registra apenas o termo de Hanna e repetição não duplica", async () => {
    await register(); await register();
    expect((await db.query("SELECT * FROM dp_trocas")).rows).toHaveLength(1);
    expect((await db.query("SELECT colaborador_id FROM dp_documentos")).rows).toEqual([{ colaborador_id: sol }]);
  });
  it("cancelamento arquiva o termo sem apagar a evidência", async () => {
    await db.exec("UPDATE dp_trocas SET status='cancelada'");
    expect((await db.query("SELECT * FROM dp_documentos WHERE arquivado_em IS NOT NULL")).rows).toHaveLength(1);
  });
});