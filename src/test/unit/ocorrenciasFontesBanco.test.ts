// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
const db=new PGlite({fsBundle:new NodeBlob([readFileSync('node_modules/@electric-sql/pglite/dist/pglite.data')]) as unknown as Blob});
const c='00000000-0000-4000-8000-000000000001', p='00000000-0000-4000-8000-000000000002';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA private; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
 CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
 CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,setor_id uuid);
 CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo text DEFAULT 'normal',origem text,status text DEFAULT 'agendada',extra boolean DEFAULT false,observacao text,criado_por uuid,direito_origem text,solicitacao_id uuid);
 CREATE TABLE dp_ferias_gozos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data_inicio date,data_fim date,status text,aprovado_em timestamptz);
 CREATE TABLE dp_dia_trabalho_excepcional(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,origem text,criado_por uuid,UNIQUE(colaborador_id,data));
 CREATE TABLE dp_ocorrencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,unidade_id uuid,setor_id uuid,data_operacional date,tipo text,estado text,origem text,previsto_entrada time,previsto_saida time,justificativa_inicial text,impacta_assiduidade text,impacta_ferias text,analise_status text,analisado_em timestamptz,relevancia_operacional boolean,assiduidade_risco boolean,assiduidade_risco_motivo text,tratativa_ponto boolean,tratativa_status text,tratativa_decisao text,subtipo text,folga_id uuid,troca_id uuid,desligamento_processo_id uuid,marcacao_alvo text,cancelado_em timestamptz,motivo_cancelamento text);
 CREATE FUNCTION private.dp_folga_ocorrencia(uuid,uuid,uuid) RETURNS void LANGUAGE sql AS 'SELECT';
 CREATE FUNCTION public.dp_ocorrencia_previsto(uuid,date) RETURNS TABLE(entrada time,saida time,unidade_id uuid,setor_id uuid) LANGUAGE sql AS 'SELECT ''08:00''::time,''16:00''::time,NULL::uuid,NULL::uuid';
 INSERT INTO dp_colaboradores VALUES('${p}','${c}',NULL,NULL);`);
 await db.exec(readFileSync('drizzle/migrations/0167_ocorrencias_ferias_remarcacoes_rastreaveis.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0169_ocorrencias_fontes_cancelamento_auditoria.sql','utf8'));
},30000);
afterAll(()=>db.close());
describe.sequential('fontes operacionais em PostgreSQL isolado',()=>{
 it('férias planejadas não geram ocorrências',async()=>{await db.exec(`INSERT INTO dp_ferias_gozos VALUES('00000000-0000-4000-8000-000000000010','${c}','${p}','2026-10-30','2026-11-02','planejado',NULL)`); expect((await db.query('SELECT * FROM dp_ocorrencias')).rows).toHaveLength(0);});
 it('aprovação gera todos os dias atravessando o mês',async()=>{await db.exec(`UPDATE dp_ferias_gozos SET status='aprovado'`); expect((await db.query('SELECT data_operacional::text FROM dp_ocorrencias ORDER BY data_operacional')).rows).toEqual([{data_operacional:'2026-10-30'},{data_operacional:'2026-10-31'},{data_operacional:'2026-11-01'},{data_operacional:'2026-11-02'}]);});
 it('reprocessamento é idempotente',async()=>{await db.exec(`UPDATE dp_ferias_gozos SET status='em_gozo'`);expect((await db.query('SELECT * FROM dp_ocorrencias')).rows).toHaveLength(4);});
 it('impactos de férias são protegidos',async()=>{await db.exec(`UPDATE dp_ocorrencias SET impacta_assiduidade='sim',impacta_ferias='sim',assiduidade_risco=true`);expect((await db.query('SELECT DISTINCT impacta_assiduidade,impacta_ferias,assiduidade_risco FROM dp_ocorrencias')).rows).toEqual([{impacta_assiduidade:'nao',impacta_ferias:'nao',assiduidade_risco:false}]);});
 it('férias já têm decisão administrativa',async()=>expect((await db.query('SELECT DISTINCT tratativa_status,tratativa_decisao FROM dp_ocorrencias')).rows).toEqual([{tratativa_status:'concluida',tratativa_decisao:'abono'}]));
 it('cancelamento retira evidência sem apagar',async()=>{await db.exec(`UPDATE dp_ferias_gozos SET status='cancelado'`);expect((await db.query("SELECT * FROM dp_ocorrencias WHERE estado<>'cancelada'")).rows).toHaveLength(0);expect((await db.query('SELECT * FROM dp_ocorrencias')).rows).toHaveLength(4);});
 it('trabalho remanejado guarda jornada mas não hora real',async()=>{await db.exec(`INSERT INTO dp_dia_trabalho_excepcional(company_id,colaborador_id,data,origem) VALUES('${c}','${p}','2026-10-10','troca_gestor')`);expect((await db.query("SELECT previsto_entrada::text,tratativa_decisao,subtipo FROM dp_ocorrencias WHERE data_operacional='2026-10-10'")).rows).toEqual([{previsto_entrada:'08:00:00',tratativa_decisao:'confirmada',subtipo:'troca_trabalho'}]);});
 it('remover trabalho excepcional cancela sua evidência',async()=>{await db.exec(`DELETE FROM dp_dia_trabalho_excepcional WHERE data='2026-10-10'`);expect((await db.query("SELECT estado FROM dp_ocorrencias WHERE data_operacional='2026-10-10'")).rows).toEqual([{estado:'cancelada'}]);});
 it('identidade da evidência não pode ser reescrita',async()=>{await expect(db.exec("UPDATE dp_ocorrencias SET subtipo='outro' WHERE ferias_gozo_id IS NOT NULL")).rejects.toThrow('OCORRENCIA_ORIGEM_IMUTAVEL');});
 it('synchronizadores privados não são executáveis por clientes',async()=>expect((await db.query("SELECT has_function_privilege('authenticated','private.dp_ferias_ocorrencias_sync(uuid)','EXECUTE') permitido")).rows).toEqual([{permitido:false}]));
});