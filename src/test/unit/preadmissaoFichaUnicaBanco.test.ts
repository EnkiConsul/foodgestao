// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const empresa = "00000000-0000-4000-8000-000000000001";
const pessoa = "00000000-0000-4000-8000-000000000002";
const ficha = "00000000-0000-4000-8000-000000000003";
const setor = "00000000-0000-4000-8000-000000000004";
const excecao = "00000000-0000-4000-8000-000000000005";
const config = "00000000-0000-4000-8000-000000000006";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${empresa}'::uuid $$;
    CREATE TYPE dp_forma_pagamento AS ENUM ('mensalista','diarista');
    CREATE TABLE dp_unidades(id uuid,company_id uuid); CREATE TABLE dp_cargos(id uuid,company_id uuid);
    CREATE TABLE dp_setores(id uuid,company_id uuid,unidade_id uuid); CREATE TABLE dp_turnos(id uuid,company_id uuid);
    CREATE TABLE dp_preadmissoes(id uuid,company_id uuid,status text,removido_em timestamptz,colaborador_id uuid,admin_dados jsonb,dados jsonb,cargo_previsto_id uuid,unidade_prevista_id uuid);
    CREATE TABLE dp_colaboradores(id uuid,company_id uuid,origem_cadastro text,ativo boolean,deleted_at timestamptz,nome text,telefone text,whatsapp text,email_contato text,cargo_id uuid,unidade_id uuid,setor_id uuid,possui_folha_ponto boolean,folha_ponto_dispensa_justificativa text,salario_base numeric,forma_pagamento dp_forma_pagamento,regime text,data_admissao date);
    CREATE TABLE dp_colaborador_config_trabalho(id uuid DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,unidade_id uuid,turno_padrao_id uuid,carga_semanal_horas numeric,folga_variavel boolean,folga_fixa_dow smallint,observacoes text,vigencia_inicio date,vigencia_fim date,compoe_equipe_habitual boolean);
    CREATE TABLE dp_colaborador_config_dias(company_id uuid,config_id uuid,dow int,trabalha boolean,turno_id uuid,entrada time,saida time,intervalo_minutos int,setor_id uuid,UNIQUE(config_id,dow));
    CREATE TABLE dp_preadmissao_eventos(preadmissao_id uuid,company_id uuid,evento text,detalhe jsonb,actor_user_id uuid);
    INSERT INTO dp_unidades VALUES('${empresa}','${empresa}'); INSERT INTO dp_cargos VALUES('${empresa}','${empresa}');
    INSERT INTO dp_setores VALUES('${setor}','${empresa}',NULL),('${excecao}','${empresa}',NULL);
    INSERT INTO dp_colaboradores(id,company_id,origem_cadastro,ativo,nome,unidade_id,cargo_id,regime,data_admissao) VALUES('${pessoa}','${empresa}','preadmissao_rotina',true,'ANTIGO','${empresa}','${empresa}','freelancer','2026-10-12');
    INSERT INTO dp_preadmissoes VALUES('${ficha}','${empresa}','aguardando_revisao',NULL,NULL,'{"rotina":{"colaborador_id":"${pessoa}"}}','{}','${empresa}','${empresa}');
    INSERT INTO dp_colaborador_config_trabalho(id,company_id,colaborador_id,unidade_id,vigencia_inicio,folga_variavel) VALUES('${config}','${empresa}','${pessoa}','${empresa}',(now() AT TIME ZONE 'America/Sao_Paulo')::date-10,false);
    INSERT INTO dp_colaborador_config_dias VALUES('${empresa}','${config}',1,true,NULL,'08:00','17:00',60,'${excecao}'),('${empresa}','${config}',2,false,NULL,NULL,NULL,NULL,NULL);`);
  await db.exec(readFileSync("drizzle/migrations/0152_preadmissao_sincronizar_cadastro_provisorio.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0153_preadmissao_sincronizacao_salario_decimal.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
describe.sequential("pré-admissão com identidade única", () => {
  it("sincroniza campos e ponto sem efetivar ou mudar o início real na loja", async () => {
    await db.query("UPDATE dp_preadmissoes SET dados=$1::jsonb,admin_dados=admin_dados||$2::jsonb WHERE id=$3", [JSON.stringify({nome:"Pessoa fictícia",telefone:"62999999999"}),JSON.stringify({setor_id:setor,possui_folha_ponto:true,regime_trabalho:"clt",salario:"2.100,50"}),ficha]);
    expect((await db.query("SELECT nome,regime,possui_folha_ponto,salario_base::text FROM dp_colaboradores")).rows).toEqual([{nome:"PESSOA FICTÍCIA",regime:"freelancer",possui_folha_ponto:true,salario_base:"2100.50"}]);
    expect((await db.query("SELECT data_admissao::text FROM dp_colaboradores")).rows).toEqual([{data_admissao:"2026-10-12"}]);
    expect((await db.query("SELECT count(*)::int n FROM dp_colaboradores")).rows).toEqual([{n:1}]);
  });
  it("mantém histórico e setor diário explícito ao sincronizar jornada", async () => {
    await db.query("UPDATE dp_preadmissoes SET admin_dados=admin_dados||$1::jsonb WHERE id=$2",[JSON.stringify({jornada:{dias:[{dow:1,trabalha:true,entrada:"09:00",saida:"18:00"},{dow:2,trabalha:false}]}}),ficha]);
    expect((await db.query("SELECT entrada::text,setor_id FROM dp_colaborador_config_dias WHERE config_id=$1 AND dow=1",[config])).rows).toEqual([{entrada:"08:00:00",setor_id:excecao}]);
    expect((await db.query("SELECT d.entrada::text,d.setor_id FROM dp_colaborador_config_dias d JOIN dp_colaborador_config_trabalho c ON c.id=d.config_id WHERE c.vigencia_fim IS NULL AND d.dow=1")).rows).toEqual([{entrada:"09:00:00",setor_id:excecao}]);
  });
  it("preserva salário decimal recebido sem máscara brasileira", async () => {
    await db.query("UPDATE dp_preadmissoes SET admin_dados=admin_dados||$1::jsonb WHERE id=$2",[JSON.stringify({salario:2100.50}),ficha]);
    expect((await db.query("SELECT salario_base::text FROM dp_colaboradores")).rows).toEqual([{salario_base:"2100.5"}]);
  });
  it("recusa setor de outra empresa e desfaz o salvamento inteiro", async () => {
    const estranho="00000000-0000-4000-8000-000000000009";
    await db.query("INSERT INTO dp_setores VALUES($1,$1,NULL)",[estranho]);
    await expect(db.query("UPDATE dp_preadmissoes SET admin_dados=admin_dados||$1::jsonb WHERE id=$2",[JSON.stringify({setor_id:estranho}),ficha])).rejects.toThrow("Setor habitual incompatível");
    expect((await db.query("SELECT setor_id FROM dp_colaboradores")).rows).toEqual([{setor_id:setor}]);
  });
  it("não altera vínculo oficial depois de efetivado", async () => {
    await db.exec(`UPDATE dp_preadmissoes SET status='concluido',colaborador_id='${pessoa}';`);
    await db.query("UPDATE dp_preadmissoes SET dados=$1::jsonb WHERE id=$2",[JSON.stringify({nome:"Não aplicar"}),ficha]);
    expect((await db.query("SELECT nome FROM dp_colaboradores")).rows).toEqual([{nome:"PESSOA FICTÍCIA"}]);
  });
});