// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "10000000-0000-4000-8000-000000000001";
const person = "10000000-0000-4000-8000-000000000002";
const unit = "10000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${person}''::uuid';
    CREATE TYPE dp_folga_tipo AS ENUM ('normal','compensatoria','ferias','licenca');
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,setor_id uuid,cargo_id uuid,regime text,forma_pagamento text,vinculo_label text,ativo boolean DEFAULT true,deleted_at timestamptz,nome text,user_id uuid);
    CREATE TABLE dp_unidades(id uuid PRIMARY KEY,company_id uuid,compensa_feriados boolean);
    CREATE TABLE dp_colaborador_compensacao(colaborador_id uuid,company_id uuid,usa_compensa_feriados boolean);
    CREATE TABLE dp_solicitacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,tipo text,status text,data_alvo date,data_fim date,motivo text,removido_em timestamptz,resposta_admin text,respondido_por uuid,respondido_em timestamptz,updated_at timestamptz);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo dp_folga_tipo,origem text,status text,extra boolean,direito_origem text,observacao text,criado_por uuid,updated_at timestamptz,solicitacao_id uuid);
    CREATE TABLE dp_folgas_canceladas(company_id uuid,colaborador_id uuid,folga_id uuid,data date,motivo text,origem_cancelamento text,cancelado_por uuid);
    CREATE TABLE dp_dia_trabalho_excepcional(company_id uuid,colaborador_id uuid,data date,origem text,criado_por uuid,updated_at timestamptz,UNIQUE(colaborador_id,data));
    CREATE TABLE dp_ocorrencias(id uuid DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,unidade_id uuid,setor_id uuid,data_operacional date,tipo text,estado text,origem text,justificativa_inicial text,impacta_assiduidade text,impacta_ferias text,analise_status text,analisado_em timestamptz,analisado_por uuid,relevancia_operacional boolean,assiduidade_risco boolean,tratativa_ponto boolean,tratativa_status text,folga_id uuid,solicitacao_id uuid,troca_id uuid,subtipo text);
    CREATE UNIQUE INDEX folga_evidencia ON dp_ocorrencias(folga_id) WHERE folga_id IS NOT NULL AND estado<>'cancelada';
    CREATE TABLE dp_notificacoes(company_id uuid,user_id uuid,colaborador_id uuid,tipo text,titulo text,descricao text,ref_table text,ref_id uuid,para_admins boolean);
    CREATE FUNCTION private.is_company_admin_or_owner(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION unidade_liberada(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION dp_dias_fixos_folga(uuid,date) RETURNS smallint[] LANGUAGE sql AS 'SELECT ARRAY[4]::smallint[]';
    CREATE FUNCTION dp_folga_limite_dia(uuid,uuid,uuid,date,uuid,uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"excedido":false,"limite":10}''::jsonb';
    CREATE FUNCTION insert_audit_log(text,text,text,jsonb) RETURNS void LANGUAGE sql AS 'SELECT';
    INSERT INTO dp_colaboradores(id,company_id,unidade_id,regime,forma_pagamento,nome,user_id) VALUES('${person}','${company}','${unit}','clt','mensalista','Pessoa fictícia','${person}');
    INSERT INTO dp_unidades VALUES('${unit}','${company}',true);
  `);
  await db.exec(readFileSync("src/test/unit/fixtures/folga-triagem-baseline.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0192_folgas_compensatorias_e_notificacoes_contextuais.sql", "utf8"));
  await db.exec(`CREATE TRIGGER notif AFTER INSERT OR UPDATE ON dp_solicitacoes FOR EACH ROW EXECUTE FUNCTION dp_notif_solicitacao();`);
}, 30000);
afterAll(() => db.close());

describe.sequential("triagem protegida e notificação contextual", () => {
  it.each([['intermitente','diarista'],['freelancer','diarista'],['freelancer','horista'],['pj','mensalista'],['mei','mensalista']])("bloqueia %s %s no servidor", async (regime, forma) => {
    await db.query(`UPDATE dp_colaboradores SET regime=$1,forma_pagamento=$2 WHERE id=$3`, [regime, forma, person]);
    await expect(db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','extra')`, [person])).rejects.toThrow(/FOLGA_REGIME/);
    expect((await db.query(`SELECT * FROM dp_folgas`)).rows).toHaveLength(0);
  });
  it("sócio não recebe folga celetista", async () => {
    await db.query(`UPDATE dp_colaboradores SET regime='pj',vinculo_label='Sócio' WHERE id=$1`, [person]);
    await expect(db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','extra')`, [person])).rejects.toThrow(/FOLGA_REGIME/);
  });
  it("unidade e exceção individual bloqueiam compensatória", async () => {
    await db.exec(`UPDATE dp_colaboradores SET regime='clt',vinculo_label=NULL; UPDATE dp_unidades SET compensa_feriados=false;`);
    await expect(db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','compensatoria',NULL,NULL,'Motivo acolhido')`, [person])).rejects.toThrow(/COMPENSACAO_INELEGIVEL/);
    await db.exec(`UPDATE dp_unidades SET compensa_feriados=true; INSERT INTO dp_colaborador_compensacao VALUES('${person}','${company}',false);`);
    await expect(db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','compensatoria',NULL,NULL,'Motivo acolhido')`, [person])).rejects.toThrow(/COMPENSACAO_INELEGIVEL/);
    await db.exec(`UPDATE dp_colaborador_compensacao SET usa_compensa_feriados=NULL;`);
  });
  it("exige justificativa e grava origem/evidência sem perda de prêmio", async () => {
    await expect(db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','compensatoria')`, [person])).rejects.toThrow(/JUSTIFICATIVA_OBRIGATORIA/);
    await db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','compensatoria',NULL,NULL,'Acompanhamento familiar autorizado')`, [person]);
    expect((await db.query(`SELECT data::text,extra,direito_origem FROM dp_folgas`)).rows).toEqual([{ data:'2026-10-30',extra:false,direito_origem:'compensacao_feriado' }]);
    const o = (await db.query<{impacta_assiduidade:string;impacta_ferias:string;subtipo:string;justificativa_inicial:string}>(`SELECT impacta_assiduidade,impacta_ferias,subtipo,justificativa_inicial FROM dp_ocorrencias`)).rows[0];
    expect(o?.impacta_assiduidade).toBe('nao');
    expect(o?.impacta_ferias).toBe('nao');
    expect(o?.subtipo).toBe('compensacao_feriado');
    expect(o?.justificativa_inicial).toContain('Acompanhamento familiar autorizado');
  });
  it("repetição não duplica nem reclassifica folga", async () => {
    await db.query(`SELECT dp_folga_atribuir_admin_v2($1,'2026-10-30','extra')`, [person]);
    expect((await db.query(`SELECT * FROM dp_folgas`)).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM dp_ocorrencias`)).rows).toHaveLength(1);
  });
  it("pedido pendente notifica gestor com duas datas; aprovação notifica colaborador", async () => {
    const r=await db.query<{id:string}>(`INSERT INTO dp_solicitacoes(company_id,colaborador_id,tipo,status,data_alvo,data_fim,motivo) VALUES($1,$2,'folga','pendente','2026-10-30','2026-11-05','Acompanhamento familiar') RETURNING id`,[company,person]);
    const n=(await db.query<{para_admins:boolean;descricao:string}>(`SELECT para_admins,descricao FROM dp_notificacoes`)).rows[0];
    expect(n?.para_admins).toBe(true);
    expect(n?.descricao).toContain('05/11/2026');
    expect(n?.descricao).toContain('30/10/2026');
    await db.query(`UPDATE dp_solicitacoes SET status='aprovada' WHERE id=$1`,[r.rows[0]?.id]);
    expect((await db.query(`SELECT colaborador_id FROM dp_notificacoes WHERE user_id IS NOT NULL`)).rows).toEqual([{colaborador_id:person}]);
    await db.query(`UPDATE dp_solicitacoes SET motivo='Mais detalhes' WHERE id=$1`,[r.rows[0]?.id]);
    expect((await db.query(`SELECT * FROM dp_notificacoes`)).rows).toHaveLength(2);
  });
});