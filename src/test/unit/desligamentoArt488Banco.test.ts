// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
const db=new PGlite({fsBundle:new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob});
const id="00000000-0000-4000-8000-000000000020";
beforeAll(async()=>{ await db.exec(`    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY, company_id uuid, unidade_id uuid, setor_id uuid);
    CREATE TABLE dp_solicitacoes(id uuid PRIMARY KEY, company_id uuid, colaborador_id uuid, tipo text, status text, removido_em timestamptz, data_alvo date, data_fim date, motivo text);
    CREATE TABLE dp_trocas(id uuid PRIMARY KEY, company_id uuid, solicitante_id uuid, destino_id uuid, data_original date, data_proposta date, status text);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, colaborador_id uuid, data date, tipo text DEFAULT 'normal', origem text, status text DEFAULT 'agendada', extra boolean DEFAULT false, direito_origem text, observacao text, created_at timestamptz DEFAULT now());
    CREATE TABLE dp_ocorrencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, colaborador_id uuid, unidade_id uuid, setor_id uuid, data_operacional date, tipo text, estado text, origem text, justificativa_inicial text, impacta_assiduidade text, impacta_ferias text, analise_status text, analisado_em timestamptz, analisado_por uuid, relevancia_operacional boolean, assiduidade_risco boolean, assiduidade_risco_motivo text, tratativa_ponto boolean, tratativa_status text, solicitacao_id uuid, troca_id uuid, cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text, marcacao_alvo text);
    CREATE UNIQUE INDEX idx_dp_ocorrencias_dedup ON dp_ocorrencias(colaborador_id,data_operacional,tipo) WHERE estado<>'cancelada' AND marcacao_alvo IS NULL;
    INSERT INTO dp_colaboradores(id,company_id) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');

 CREATE TABLE dp_desligamento_processos(id uuid primary key,company_id uuid,colaborador_id uuid,status text,reducao text,modalidade text,motivo text,inicio_aviso date,data_efetiva date,criado_por uuid);
 ALTER TABLE dp_folgas ADD COLUMN desligamento_processo_id uuid;
 CREATE FUNCTION dp_desligamento_banco_aplicar(uuid,jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
 CREATE FUNCTION dp_meu_desligamento() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
 CREATE FUNCTION dp_preadmissao_efetivar_direto(uuid,date,boolean) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_a jsonb;v_colab uuid;pa record; BEGIN
 -- Status e conferência exigidos
 RETURN '{}'::jsonb; END $$;
 ALTER TABLE dp_colaboradores ADD COLUMN possui_folha_ponto boolean, ADD COLUMN folha_ponto_dispensa_justificativa text;
 `);
 await db.exec(readFileSync("drizzle/migrations/0137_folgas_trocas_justificativas_vinculadas.sql","utf8"));
 await db.exec(readFileSync("/tmp/desligamento/migration.sql","utf8"));
 await db.exec(`INSERT INTO dp_desligamento_processos VALUES('${id}','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','aviso_em_curso','sete_dias','trabalhado','dispensa_sem_justa_causa','2026-10-08','2026-11-06',NULL)`);
},30000);
afterAll(()=>db.close());
const payload=(dias:string[])=>JSON.stringify({extrato_aviso:{dias_art488:dias,periodo_reducao:{inicio:'2026-10-31',fim:'2026-11-06'}}});
it('gera seis abonos idempotentes, sem DSR e com impactos protegidos',async()=>{
 const dias=['2026-10-31','2026-11-01','2026-11-02','2026-11-04','2026-11-05','2026-11-06'];
 await db.query('select dp_desligamento_banco_aplicar($1,$2::jsonb)',[id,payload(dias)]);
 await db.query('select dp_desligamento_banco_aplicar($1,$2::jsonb)',[id,payload(dias)]);
 expect((await db.query('select count(*)::int n from dp_ocorrencias')).rows).toEqual([{n:6}]);
 expect((await db.query("select * from dp_ocorrencias where data_operacional='2026-11-03'")).rows).toHaveLength(0);
 await db.exec("update dp_ocorrencias set impacta_assiduidade='sim',impacta_ferias='sim',assiduidade_risco=true");
 expect((await db.query("select distinct impacta_assiduidade,impacta_ferias,assiduidade_risco,tratativa_status from dp_ocorrencias")).rows).toEqual([{impacta_assiduidade:'nao',impacta_ferias:'nao',assiduidade_risco:false,tratativa_status:'pendente'}]);
 await expect(db.exec("update dp_ocorrencias set data_operacional='2026-11-07'")).rejects.toThrow('Altere o processo');
 await db.query('select dp_desligamento_banco_aplicar($1,$2::jsonb)',[id,payload(['2026-10-31'])]);
 expect((await db.query("select count(*)::int n from dp_ocorrencias where estado='cancelada'")).rows).toEqual([{n:5}]);
 await db.exec("update dp_desligamento_processos set status='reconsiderado'");
 expect((await db.query("select count(*)::int n from dp_ocorrencias where estado<>'cancelada'")).rows).toEqual([{n:0}]);
});
