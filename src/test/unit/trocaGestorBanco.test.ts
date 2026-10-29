// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite({fsBundle:new NodeBlob([readFileSync('node_modules/@electric-sql/pglite/dist/pglite.data')]) as unknown as Blob});
const company='00000000-0000-4000-8000-000000000001';
const unit='00000000-0000-4000-8000-000000000002';
const sol='00000000-0000-4000-8000-000000000003';
const dest='00000000-0000-4000-8000-000000000004';
const manager='00000000-0000-4000-8000-000000000005';
let dayA:string; let dayB:string;
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA private; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.actor'',true),'''')::uuid';
 SELECT set_config('test.actor','${manager}',false);
 CREATE TABLE companies(id uuid,timezone text);
 INSERT INTO companies VALUES('${company}','America/Sao_Paulo');
 CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,nome text,origem_cadastro text,ativo boolean DEFAULT true,deleted_at timestamptz,data_admissao date,data_desligamento date,user_id uuid);
 INSERT INTO dp_colaboradores(id,company_id,unidade_id,nome,origem_cadastro) VALUES('${sol}','${company}','${unit}','Pessoa CLT','manual'),('${dest}','${company}','${unit}','Pessoa em admissão','preadmissao_rotina');
 CREATE TABLE dp_trocas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid,solicitante_id uuid,destino_id uuid,data_original date,data_proposta date,motivo text,status text,created_by uuid,gestor_id uuid,gestor_resposta text,gestor_respondido_em timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),solicitante_assinatura text,destino_assinatura text,colega_resposta text,colega_respondido_em timestamptz,cancelamento_solicitado_em timestamptz,cancelamento_solicitado_por uuid,cancelamento_motivo text);
 CREATE FUNCTION public.dp_trocas_exige_assinatura_solicitante() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
 CREATE TRIGGER trg_dp_trocas_exige_assinatura BEFORE UPDATE ON dp_trocas FOR EACH ROW EXECUTE FUNCTION public.dp_trocas_exige_assinatura_solicitante();
 CREATE TABLE dp_folgas(id uuid DEFAULT gen_random_uuid(),colaborador_id uuid,data date,status text DEFAULT 'agendada');
 CREATE TABLE dp_desligamento_processos(company_id uuid,colaborador_id uuid,status text,ultimo_comparecimento date);
 CREATE TABLE dp_escalas(id uuid,status text); CREATE TABLE dp_escala_itens(escala_id uuid,colaborador_id uuid,data date,tipo text,updated_at timestamptz);
 CREATE TABLE dp_ocorrencias(troca_id uuid,colaborador_id uuid,estado text DEFAULT 'confirmada',subtipo text,tratativa_ponto boolean,tratativa_status text,tratativa_decisao text,analisado_por uuid,justificativa_inicial text);
 CREATE TABLE dp_dsr_ciencias(company_id uuid,colaborador_id uuid,user_id uuid,papel text,referencia_tabela text,referencia_id uuid,data_referencia date,dias_seguidos int);
 CREATE TABLE dp_notificacoes(company_id uuid,user_id uuid,colaborador_id uuid,tipo text,titulo text,descricao text,ref_table text,ref_id uuid,para_admins boolean);
 CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $1=''${manager}''::uuid AND $2=''${company}''::uuid';
 CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE FUNCTION public.unidade_liberada(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
 CREATE FUNCTION public.dp_config_resolvida(uuid,uuid) RETURNS TABLE(troca_folga_modo text) LANGUAGE sql AS 'SELECT ''aprovacao_admin''::text';
 CREATE FUNCTION private.dp_colab_afastado_em(uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT coalesce(current_setting(''test.afastado'',true),'''')=''on''';
 CREATE FUNCTION public.dp_rotina_ausencia_operacional_em(uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT false';
 CREATE FUNCTION private.dp_troca_folga_fixa_livre(uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT extract(dow from $2)=0';
 CREATE FUNCTION private.dp_regra_bloqueia_colaborador(uuid,date) RETURNS text LANGUAGE sql AS 'SELECT null::text';
 CREATE FUNCTION private.dp_troca_efetivar(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE t dp_trocas%ROWTYPE; BEGIN
 SELECT * INTO t FROM dp_trocas WHERE id=$1;
 UPDATE dp_folgas SET status='cancelada' WHERE (colaborador_id=t.solicitante_id AND data=t.data_original) OR (colaborador_id=t.destino_id AND data=t.data_proposta);
 INSERT INTO dp_folgas(colaborador_id,data) VALUES(t.solicitante_id,t.data_proposta),(t.destino_id,t.data_original);
 IF coalesce(current_setting('test.fail',true),'')='on' THEN RAISE EXCEPTION 'motor_failure'; END IF;
 INSERT INTO dp_ocorrencias(troca_id,colaborador_id,subtipo,tratativa_ponto,tratativa_status) VALUES(t.id,t.solicitante_id,'troca_folga',true,'pendente'),(t.id,t.destino_id,'troca_folga',true,'pendente'),(t.id,t.solicitante_id,'troca_trabalho',true,'pendente'),(t.id,t.destino_id,'troca_trabalho',true,'pendente');
 RETURN '{}'::jsonb; END $$;`);
 await db.exec(readFileSync('supabase/migrations/20261027010500_troca_gestor_admissao.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0159_troca_gestor_cancelamento_portal.sql','utf8'));
 await db.exec(`CREATE TRIGGER notificacao AFTER INSERT OR UPDATE ON dp_trocas FOR EACH ROW EXECUTE FUNCTION dp_notif_troca();`);
 // Stable Monday/Wednesday fixture: neither receiving day accidentally becomes Sunday as time advances.
 const dates=await db.query<{a:string;b:string}>(`SELECT (CURRENT_DATE+(8-extract(dow from CURRENT_DATE)::int)%7+7)::text a,(CURRENT_DATE+(8-extract(dow from CURRENT_DATE)::int)%7+9)::text b`);dayA=dates.rows[0].a;dayB=dates.rows[0].b;
 await db.query(`INSERT INTO dp_folgas(colaborador_id,data) VALUES($1,$2),($3,$4)`,[sol,dayA,dest,dayB]);
},30000);
afterAll(()=>db.close());
const args=()=>[company,sol,dest,dayA,dayB,'Acordo informado ao gestor',true,false];
describe.sequential('troca administrativa — SQL isolado sem dados reais',()=>{
 it('recusa pessoa/empresa diferente e sessão sem gestão',async()=>{
  await expect(db.query(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5)`,['00000000-0000-4000-8000-000000000099',sol,dest,dayA,dayB])).rejects.toThrow('FORBIDDEN');
  await db.query(`SELECT set_config('test.actor',$1,false)`,[sol]);
  await expect(db.query(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5)`,args().slice(0,5))).rejects.toThrow('FORBIDDEN');
  await db.query(`SELECT set_config('test.actor',$1,false)`,[manager]);
 });
 it('recusa datas iguais e passadas',async()=>{
  await expect(db.query(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5)`,[company,sol,dest,dayA,dayA])).rejects.toThrow('INVALID_INPUT');
  await expect(db.query(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5)`,[company,sol,dest,'2020-01-01','2020-01-02'])).rejects.toThrow('PAST_DATE_NOT_EDITABLE');
 });
 it('recusa afastamento em qualquer participante',async()=>{
  await db.exec(`SELECT set_config('test.afastado','on',false)`);
  await expect(db.query(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5)`,args().slice(0,5))).rejects.toThrow('TROCA_FOLGA_EM_AFASTAMENTO');
  await db.exec(`SELECT set_config('test.afastado','off',false)`);
 });
 it('prévia reconhece pessoa em admissão sem usuário e não grava troca',async()=>{
  const r=await db.query<{v:{em_admissao:boolean}}>(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5) v`,args().slice(0,5));
  expect(r.rows[0].v.em_admissao).toBe(true);
  expect((await db.query(`SELECT * FROM dp_trocas`)).rows).toHaveLength(0);
 });
 it('sete dias consecutivos afetados pela troca exigem ciência do gestor',async()=>{
  await db.exec(`BEGIN; CREATE OR REPLACE FUNCTION private.dp_troca_folga_fixa_livre(uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT $1=''${sol}''::uuid AND extract(dow from $2)=0'`);
  const sunday=(await db.query<{d:string}>(`SELECT (CURRENT_DATE+(7-extract(dow from CURRENT_DATE)::int)%7+7)::text d`)).rows[0].d;
  const monday=(await db.query<{d:string}>(`SELECT ($1::date+1)::text d`,[sunday])).rows[0].d;
  await db.query(`INSERT INTO dp_folgas(colaborador_id,data) VALUES($1,$2)`,[dest,monday]);
  const r=await db.query<{v:{riscos:{colaborador_id:string;dias:number}[]}}>(`SELECT dp_troca_gestor_previa($1,$2,$3,$4,$5) v`,[company,sol,dest,sunday,monday]);
  expect(r.rows[0].v.riscos).toContainEqual({colaborador_id:sol,nome:'Pessoa CLT',dias:7});
  await expect(db.query(`SELECT dp_troca_gestor_registrar($1,$2,$3,$4,$5,$6,false,false)`,[company,sol,dest,sunday,monday,'Acordo informado'])).rejects.toThrow('DSR_CIENCIA_OBRIGATORIA');
  await db.exec('ROLLBACK');
 });
 it('falha do motor desfaz troca e folgas na mesma transação',async()=>{
  await db.exec(`SELECT set_config('test.fail','on',false)`);
  await expect(db.query(`SELECT dp_troca_gestor_registrar($1,$2,$3,$4,$5,$6,$7,$8)`,args())).rejects.toThrow('motor_failure');
  expect((await db.query(`SELECT * FROM dp_trocas`)).rows).toHaveLength(0);
  expect((await db.query(`SELECT * FROM dp_folgas WHERE status='agendada'`)).rows).toHaveLength(2);
  await db.exec(`SELECT set_config('test.fail','off',false)`);
 });
 it('registra troca sem portal/assinatura e quatro eventos sem pendência',async()=>{
  await db.query(`SELECT dp_troca_gestor_registrar($1,$2,$3,$4,$5,$6,$7,$8)`,args());
  expect((await db.query(`SELECT status,origem_registro,solicitante_assinatura,destino_assinatura,colega_resposta FROM dp_trocas`)).rows).toEqual([{status:'aprovada',origem_registro:'gestor',solicitante_assinatura:null,destino_assinatura:null,colega_resposta:null}]);
  expect((await db.query(`SELECT * FROM dp_ocorrencias WHERE NOT tratativa_ponto AND tratativa_status='nao_se_aplica'`)).rows).toHaveLength(4);
  expect((await db.query(`SELECT * FROM dp_notificacoes`)).rows).toHaveLength(0);
  expect((await db.query(`SELECT user_id,origem_cadastro FROM dp_colaboradores WHERE id=$1`,[dest])).rows).toEqual([{user_id:null,origem_cadastro:'preadmissao_rotina'}]);
 });
 it('recusa duplicata e origem alterada para fingir dispensa de assinatura',async()=>{
  await expect(db.query(`SELECT dp_troca_gestor_registrar($1,$2,$3,$4,$5,$6,$7,$8)`,args())).rejects.toThrow('DUPLICATE_REQUEST');
  await expect(db.exec(`UPDATE dp_trocas SET origem_registro='portal'`)).rejects.toThrow('imutável');
  });
 it('participante pede cancelamento sem ser gestor, sem alterar mais nada',async()=>{
  const solUser='00000000-0000-4000-8000-000000000006';
  await db.query(`UPDATE dp_colaboradores SET user_id=$1 WHERE id=$2`,[solUser,sol]);
  await db.query(`SELECT set_config('test.actor',$1,false)`,[solUser]);
  await db.query(`UPDATE dp_trocas SET cancelamento_solicitado_em=now(),cancelamento_solicitado_por=$1,cancelamento_motivo='Preciso desfazer a troca combinada',updated_at=now()`,[sol]);
  const r=await db.query<{p:string;s:string;a:string|null}>(`SELECT cancelamento_solicitado_por p,status s,solicitante_assinatura a FROM dp_trocas`);
  expect(r.rows[0].p).toBe(sol); expect(r.rows[0].s).toBe('aprovada'); expect(r.rows[0].a).toBeNull();
 });
 it('participante não altera outros campos nem pede cancelamento por terceiro',async()=>{
  const solUser='00000000-0000-4000-8000-000000000006';
  await expect(db.exec(`UPDATE dp_trocas SET status='cancelada'`)).rejects.toThrow('FORBIDDEN');
  await expect(db.query(`UPDATE dp_trocas SET cancelamento_solicitado_em=now(),cancelamento_solicitado_por=$1,cancelamento_motivo='Tentativa em nome de outro'`,[dest])).rejects.toThrow('FORBIDDEN');
  await db.query(`SELECT set_config('test.actor',$1,false)`,[manager]);
  await db.query(`UPDATE dp_trocas SET cancelamento_solicitado_em=NULL,cancelamento_solicitado_por=NULL,cancelamento_motivo=NULL,updated_at=now()`);
  expect((await db.query<{cancelamento_solicitado_em:string|null}>(`SELECT cancelamento_solicitado_em FROM dp_trocas`)).rows[0].cancelamento_solicitado_em).toBeNull();
 });
});
