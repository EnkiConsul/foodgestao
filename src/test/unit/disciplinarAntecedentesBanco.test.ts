// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const empresa = "00000000-0000-4000-8000-000000000001", pessoa = "00000000-0000-4000-8000-000000000002", ator = "00000000-0000-4000-8000-000000000003", verbal = "00000000-0000-4000-8000-000000000004", escrita = "00000000-0000-4000-8000-000000000005", outro = "00000000-0000-4000-8000-000000000006";
beforeAll(async () => {
  await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.actor'',true),'''')::uuid';
    SELECT set_config('test.actor','${ator}',false);
    CREATE TYPE dp_disciplinar_tipo AS ENUM ('advertencia_verbal','advertencia_escrita','suspensao','elogio');
    CREATE TABLE companies(id uuid,user_id uuid);
    INSERT INTO companies VALUES('${empresa}','${ator}');
    CREATE TABLE dp_colaboradores(id uuid,company_id uuid,data_admissao date);
    INSERT INTO dp_colaboradores VALUES('${pessoa}','${empresa}','2026-09-01');
    CREATE TABLE dp_registros_disciplinares(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,tipo dp_disciplinar_tipo,data date,motivo text,descricao text,suspensao_dias integer,removido_em timestamptz,via_assinada_path text);
    INSERT INTO dp_registros_disciplinares(id,company_id,colaborador_id,tipo,data,motivo,via_assinada_path) VALUES
    ('${verbal}','${empresa}','${pessoa}','advertencia_verbal','2026-09-10','Atraso',null),
    ('${escrita}','${empresa}','${pessoa}','advertencia_escrita','2026-09-20','Indisciplina','via.pdf'),
    ('${outro}','${empresa}','${empresa}','advertencia_verbal','2026-09-15','Outro',null);
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $1=''${ator}''::uuid AND $2=''${empresa}''::uuid';
    CREATE FUNCTION dp_registro_disciplinar_registrar(uuid,text,date,text,text,integer) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE v uuid; BEGIN INSERT INTO dp_registros_disciplinares(company_id,colaborador_id,tipo,data,motivo,descricao,suspensao_dias) VALUES('${empresa}',$1,$2::dp_disciplinar_tipo,$3,$4,$5,$6) RETURNING id INTO v; RETURN v; END $$;
    CREATE FUNCTION dp_registro_disciplinar_corrigir(uuid,uuid,text,date,text,text,integer) RETURNS void LANGUAGE sql AS 'UPDATE dp_registros_disciplinares SET motivo=$5,descricao=$6 WHERE id=$1';`);
  await db.exec(readFileSync("drizzle/migrations/0172_disciplinar_antecedentes_contrato.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
const registrar = (ids: string[]) => db.query<{ id: string }>(`SELECT dp_registro_disciplinar_registrar_documentado($1,'advertencia_escrita','2026-10-29','Novos fatos','Descrição nova',null,$2::uuid[]) id`, [pessoa, ids]);
describe.sequential("referências disciplinares em banco isolado", () => {
  it("grava verbal e escrita com snapshot e deduplica referências", async () => {
    const result = await registrar([escrita,verbal,verbal]);
    const r = await db.query<{ antecedentes_ids: string[]; antecedentes_snapshot: unknown[]; reincidencia_texto: string }>("SELECT antecedentes_ids,antecedentes_snapshot,reincidencia_texto FROM dp_registros_disciplinares WHERE id=$1", [result.rows[0].id]);
    expect(r.rows[0].antecedentes_ids).toHaveLength(2);
    expect(r.rows[0].antecedentes_snapshot).toHaveLength(2);
    expect(r.rows[0].reincidencia_texto).toContain("10/09/2026");
  });
  it("não citar nenhuma mantém carta neutra", async () => {
    const r = await registrar([]);
    expect((await db.query("SELECT reincidencia_texto FROM dp_registros_disciplinares WHERE id=$1",[r.rows[0].id])).rows[0]).toEqual({reincidencia_texto:null});
  });
  it("recusa outra pessoa sem deixar a nova punição gravada", async () => {
    const count = (await db.query("SELECT count(*) n FROM dp_registros_disciplinares")).rows[0];
    await expect(registrar([outro])).rejects.toThrow("DISC_ANTECEDENTE_INVALIDO");
    expect((await db.query("SELECT count(*) n FROM dp_registros_disciplinares")).rows[0]).toEqual(count);
  });
  it("recusa contrato anterior", async () => {
    await db.exec(`UPDATE dp_colaboradores SET data_admissao='2026-09-15'`);
    await expect(registrar([verbal])).rejects.toThrow("DISC_ANTECEDENTE_INVALIDO");
    await db.exec(`UPDATE dp_colaboradores SET data_admissao='2026-09-01'`);
  });
  it("recusa referência inexistente", async () => {
    await expect(registrar(["00000000-0000-4000-8000-000000000099"])).rejects.toThrow("DISC_ANTECEDENTE_INVALIDO");
  });
  it("recusa minuta sem assinatura", async () => {
    await db.exec(`UPDATE dp_registros_disciplinares SET via_assinada_path=null WHERE id='${escrita}'`);
    await expect(registrar([escrita])).rejects.toThrow("DISC_ANTECEDENTE_INVALIDO");
    await db.exec(`UPDATE dp_registros_disciplinares SET via_assinada_path='via.pdf' WHERE id='${escrita}'`);
  });
  it("preserva snapshot mesmo quando a referência original é corrigida", async () => {
    const result = await registrar([verbal]);
    await db.exec(`UPDATE dp_registros_disciplinares SET motivo='Corrigido' WHERE id='${verbal}'`);
    const r = await db.query<{ antecedentes_snapshot: {motivo:string}[] }>("SELECT antecedentes_snapshot FROM dp_registros_disciplinares WHERE id=$1",[result.rows[0].id]);
    expect(r.rows[0].antecedentes_snapshot[0].motivo).toBe("Atraso");
  });
  it("recusa ator sem autorização", async () => {
    await db.exec(`SELECT set_config('test.actor','${outro}',false)`);
    await expect(registrar([])).rejects.toThrow("FORBIDDEN");
    await db.exec(`SELECT set_config('test.actor','${ator}',false)`);
  });
});