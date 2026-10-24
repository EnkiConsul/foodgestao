// @vitest-environment node
// Runs the actual migration against an isolated in-memory PostgreSQL database.
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "00000000-0000-4000-8000-000000000001";
const person = "00000000-0000-4000-8000-000000000002";
const colleague = "00000000-0000-4000-8000-000000000003";

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY, company_id uuid, unidade_id uuid, setor_id uuid);
    CREATE TABLE dp_solicitacoes(id uuid PRIMARY KEY, company_id uuid, colaborador_id uuid, tipo text, status text, removido_em timestamptz, data_alvo date, data_fim date, motivo text);
    CREATE TABLE dp_trocas(id uuid PRIMARY KEY, company_id uuid, solicitante_id uuid, destino_id uuid, data_original date, data_proposta date, status text);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, colaborador_id uuid, data date, tipo text DEFAULT 'normal', origem text, status text DEFAULT 'agendada', extra boolean DEFAULT false, direito_origem text, observacao text, created_at timestamptz DEFAULT now());
    CREATE TABLE dp_ocorrencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, colaborador_id uuid, unidade_id uuid, setor_id uuid, data_operacional date, tipo text, estado text, origem text, justificativa_inicial text, impacta_assiduidade text, impacta_ferias text, analise_status text, analisado_em timestamptz, analisado_por uuid, relevancia_operacional boolean, assiduidade_risco boolean, assiduidade_risco_motivo text, tratativa_ponto boolean, tratativa_status text, solicitacao_id uuid, troca_id uuid, cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text, marcacao_alvo text);
    CREATE UNIQUE INDEX idx_dp_ocorrencias_dedup ON dp_ocorrencias(colaborador_id,data_operacional,tipo) WHERE estado<>'cancelada' AND marcacao_alvo IS NULL;
    INSERT INTO dp_colaboradores(id,company_id) VALUES ('${person}','${company}'),('${colleague}','${company}');
  `);
  await db.exec(readFileSync("drizzle/migrations/0137_folgas_trocas_justificativas_vinculadas.sql", "utf8"));
  await db.exec(`CREATE TRIGGER dp_troca_ocorrencias_aiu AFTER INSERT OR UPDATE OF status ON dp_trocas FOR EACH ROW EXECUTE FUNCTION private.dp_troca_ocorrencias_trg();`);
  await db.exec(`
    ALTER TABLE dp_folgas ADD COLUMN updated_at timestamptz;
    ALTER TABLE dp_trocas ADD COLUMN gestor_resposta text, ADD COLUMN gestor_respondido_em timestamptz, ADD COLUMN gestor_id uuid, ADD COLUMN updated_at timestamptz;
    CREATE TABLE dp_folgas_canceladas(company_id uuid,colaborador_id uuid,folga_id uuid,data date,motivo text,origem_cancelamento text,cancelado_por uuid);
    CREATE TABLE dp_dia_trabalho_excepcional(company_id uuid,colaborador_id uuid,data date,origem text);
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
  `);
  await db.exec(readFileSync("drizzle/migrations/0138_folga_exclusao_e_troca_estorno_integral.sql", "utf8"));
}, 30000);
afterAll(() => db.close());

describe.sequential("geração transacional de justificativas", () => {
  it("folga semanal habitual não gera ocorrência", async () => {
    await db.exec(`INSERT INTO dp_folgas(company_id,colaborador_id,data) VALUES('${company}','${person}','2026-10-01')`);
    expect((await db.query("SELECT * FROM dp_ocorrencias WHERE data_operacional='2026-10-01'")).rows).toHaveLength(0);
  });
  it.each([['folga_extra', 'Folga extra autorizada'], ['compensacao_feriado', 'Folga compensatória autorizada']])("%s gera abono pendente, não duplica e protege assiduidade/férias", async (subtipo, observacao) => {
    const dia = subtipo === 'folga_extra' ? '2026-10-02' : '2026-10-03';
    const f = await db.query<{id:string}>(`INSERT INTO dp_folgas(company_id,colaborador_id,data,extra,observacao) VALUES($1,$2,$3,true,$4) RETURNING id`, [company,person,dia,observacao]);
    const fid = f.rows[0]?.id;
    await db.query(`SELECT private.dp_folga_ocorrencia($1,NULL,NULL)`,[fid]);
    await db.query(`UPDATE dp_ocorrencias SET impacta_assiduidade='sim',impacta_ferias='sim',assiduidade_risco=true WHERE folga_id=$1`,[fid]);
    const rows = (await db.query(`SELECT subtipo,impacta_assiduidade,impacta_ferias,assiduidade_risco,analise_status,tratativa_ponto,tratativa_status FROM dp_ocorrencias WHERE folga_id=$1`,[fid])).rows;
    expect(rows).toEqual([{subtipo,impacta_assiduidade:'nao',impacta_ferias:'nao',assiduidade_risco:false,analise_status:'analisada',tratativa_ponto:true,tratativa_status:'pendente'}]);
    await db.query(`UPDATE dp_folgas SET status='cancelada' WHERE id=$1`,[fid]);
    expect((await db.query(`SELECT estado FROM dp_ocorrencias WHERE folga_id=$1`,[fid])).rows).toEqual([{estado:'cancelada'}]);
  });
  it("pedido pendente não gera justificativa, aprovação liga pedido e folga, cancelamento cancela evidência", async () => {
    const sid='00000000-0000-4000-8000-000000000010';
    await db.exec(`INSERT INTO dp_solicitacoes VALUES('${sid}','${company}','${person}','folga','pendente',NULL,'2026-10-04',NULL,'Compensação de feriado trabalhado')`);
    expect((await db.query(`SELECT * FROM dp_ocorrencias WHERE solicitacao_id=$1`,[sid])).rows).toHaveLength(0);
    await db.exec(`INSERT INTO dp_folgas(company_id,colaborador_id,data,extra,observacao) VALUES('${company}','${person}','2026-10-04',true,'Folga compensatória autorizada'); UPDATE dp_solicitacoes SET status='aprovada' WHERE id='${sid}';`);
    expect((await db.query(`SELECT subtipo FROM dp_ocorrencias WHERE solicitacao_id=$1 AND folga_id IS NOT NULL`,[sid])).rows).toEqual([{subtipo:'compensacao_feriado'}]);
    await db.exec(`UPDATE dp_solicitacoes SET status='cancelada' WHERE id='${sid}'`);
    expect((await db.query(`SELECT estado FROM dp_ocorrencias WHERE solicitacao_id=$1`,[sid])).rows).toEqual([{estado:'cancelada'}]);
  });
  it("troca fixa deslocada gera justificativa, exclusão cancela antes de perder o vínculo", async () => {
    const f=await db.query<{id:string}>(`INSERT INTO dp_folgas(company_id,colaborador_id,data,direito_origem) VALUES($1,$2,'2026-10-05','folga_fixa_deslocada') RETURNING id`,[company,person]);
    const fid=f.rows[0]?.id;
    const o=await db.query<{id:string}>(`SELECT id FROM dp_ocorrencias WHERE folga_id=$1`,[fid]);
    expect(o.rows).toHaveLength(1);
    await db.query(`DELETE FROM dp_folgas WHERE id=$1`,[fid]);
    expect((await db.query(`SELECT estado FROM dp_ocorrencias WHERE id=$1`,[o.rows[0]?.id])).rows).toEqual([{estado:'cancelada'}]);
  });
  it("troca entre colegas justifica dois dias ausentes e dois trabalhados; cancelar retira as quatro evidências", async () => {
    const tid='00000000-0000-4000-8000-000000000020';
    await db.exec(`INSERT INTO dp_trocas VALUES('${tid}','${company}','${person}','${colleague}','2026-10-06','2026-10-07','pendente_gestor'); INSERT INTO dp_folgas(company_id,colaborador_id,data,observacao) VALUES('${company}','${person}','2026-10-07','Troca aprovada (id=${tid})'),('${company}','${colleague}','2026-10-06','Troca aprovada (id=${tid})'); UPDATE dp_trocas SET status='aprovada' WHERE id='${tid}';`);
    const rows=(await db.query(`SELECT subtipo,count(*)::int total FROM dp_ocorrencias WHERE troca_id=$1 GROUP BY subtipo ORDER BY subtipo`,[tid])).rows;
    expect(rows).toEqual([{subtipo:'troca_folga',total:2},{subtipo:'troca_trabalho',total:2}]);
    await db.exec(`UPDATE dp_trocas SET status='cancelada' WHERE id='${tid}'`);
    expect((await db.query(`SELECT * FROM dp_ocorrencias WHERE troca_id=$1 AND estado<>'cancelada'`,[tid])).rows).toHaveLength(0);
  });
  it("estorno oficial restaura ambas as folgas originais e retira os dois dias excepcionais de trabalho", async () => {
    const tid='00000000-0000-4000-8000-000000000030';
    await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${person}''::uuid';
      INSERT INTO dp_trocas(id,company_id,solicitante_id,destino_id,data_original,data_proposta,status) VALUES('${tid}','${company}','${person}','${colleague}','2026-10-08','2026-10-09','pendente_gestor');
      INSERT INTO dp_folgas(company_id,colaborador_id,data,status) VALUES('${company}','${person}','2026-10-08','cancelada'),('${company}','${colleague}','2026-10-09','cancelada');
      INSERT INTO dp_folgas_canceladas(company_id,colaborador_id,folga_id,data,motivo,origem_cancelamento) SELECT company_id,colaborador_id,id,data,'Troca aprovada (id=${tid})','troca' FROM dp_folgas WHERE data IN ('2026-10-08','2026-10-09');
      INSERT INTO dp_dia_trabalho_excepcional VALUES('${company}','${person}','2026-10-08','troca'),('${company}','${colleague}','2026-10-09','troca');
      INSERT INTO dp_folgas(company_id,colaborador_id,data,observacao) VALUES('${company}','${person}','2026-10-09','Troca aprovada (id=${tid})'),('${company}','${colleague}','2026-10-08','Troca aprovada (id=${tid})');
      UPDATE dp_trocas SET status='aprovada' WHERE id='${tid}';
      SELECT public.dp_cancelar_troca('${tid}','Reconsideração autorizada');`);
    expect((await db.query(`SELECT colaborador_id,data::text FROM dp_folgas WHERE data IN ('2026-10-08','2026-10-09') AND status='agendada' ORDER BY data`)).rows).toEqual([{colaborador_id:person,data:'2026-10-08'},{colaborador_id:colleague,data:'2026-10-09'}]);
    expect((await db.query(`SELECT * FROM dp_dia_trabalho_excepcional WHERE data IN ('2026-10-08','2026-10-09')`)).rows).toHaveLength(0);
    expect((await db.query(`SELECT * FROM dp_ocorrencias WHERE troca_id=$1 AND estado<>'cancelada'`,[tid])).rows).toHaveLength(0);
  });
});