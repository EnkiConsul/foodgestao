// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "00000000-0000-4000-8000-000000000001";
const sector = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const pa = "00000000-0000-4000-8000-000000000004";
const process = "00000000-0000-4000-8000-000000000005";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TYPE dp_regime_trabalho AS ENUM ('freelancer'); CREATE TYPE dp_forma_pagamento AS ENUM ('mensalista','diarista');
    CREATE TABLE dp_setores(id uuid,company_id uuid,unidade_id uuid);
    CREATE TABLE dp_preadmissoes(id uuid,company_id uuid,removido_em timestamptz,status text,admin_dados jsonb,regime_previsto text,cargo_previsto_id uuid,unidade_prevista_id uuid,dados jsonb,cpf text,whatsapp text,email text,data_nascimento date,candidato_nome text,updated_at timestamptz);
    CREATE TABLE dp_colaboradores(id uuid DEFAULT gen_random_uuid(),company_id uuid,nome text,cpf text,whatsapp text,telefone text,email_contato text,data_nascimento date,cargo_id uuid,unidade_id uuid,setor_id uuid,regime dp_regime_trabalho,forma_pagamento dp_forma_pagamento,data_admissao date,ativo boolean,origem_cadastro text,deleted_at timestamptz,user_id uuid);
    CREATE TABLE dp_colaborador_config_trabalho(id uuid DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,unidade_id uuid,folga_variavel boolean,vigencia_inicio date,observacoes text);
    CREATE TABLE dp_colaborador_config_dias(company_id uuid,config_id uuid,dow int,trabalha boolean,turno_id uuid,entrada time,saida time,intervalo_minutos int,setor_id uuid);
    CREATE TABLE dp_preadmissao_eventos(preadmissao_id uuid,company_id uuid,evento text,detalhe jsonb,actor_user_id uuid);
    CREATE TABLE dp_desligamento_processos(id uuid,company_id uuid,colaborador_id uuid,comunicacao_confirmada_em timestamptz);
    CREATE TABLE dp_notificacoes(company_id uuid,user_id uuid,colaborador_id uuid,tipo text,titulo text,descricao text,ref_table text,ref_id uuid,para_admins boolean,chave text);
    INSERT INTO dp_setores VALUES('${sector}','${company}',NULL),('${other}','${company}',NULL);
    INSERT INTO dp_preadmissoes(id,company_id,status,admin_dados,regime_previsto,cargo_previsto_id,unidade_prevista_id,dados,candidato_nome)
      VALUES('${pa}','${company}','aguardando_revisao','{"setor_id":"${sector}"}','clt','${company}','${company}','{}','PESSOA FICTÍCIA');`);
  await db.exec(readFileSync("drizzle/migrations/0134_preadmissao_ativar_rotina_consolida_jornada.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0147_preadmissao_setor_e_notificacoes_desligamento.sql", "utf8"));
}, 30000);
afterAll(() => db.close());

describe.sequential("setor herdado e identidade dos alertas", () => {
  it("herda setor nos dias trabalhados vazios, preserva exceção e não atribui à folga", async () => {
    const jornada = {dias:[{dow:0,trabalha:true,entrada:"08:00",saida:"17:00"},{dow:1,trabalha:true,entrada:"08:00",saida:"17:00",setor_id:other},{dow:2,trabalha:false}]};
    await db.query("select dp_preadmissao_ativar_rotina($1,'2026-10-12',$2::jsonb)",[pa,JSON.stringify(jornada)]);
    expect((await db.query("select setor_id from dp_colaboradores")).rows).toEqual([{setor_id:sector}]);
    expect((await db.query("select dow,setor_id from dp_colaborador_config_dias order by dow")).rows)
      .toEqual([{dow:0,setor_id:sector},{dow:1,setor_id:other},{dow:2,setor_id:null}]);
  });
  it("recusa setor de outra empresa antes de criar cadastro", async () => {
    await db.exec(`UPDATE dp_preadmissoes SET admin_dados='{"setor_id":"${other}"}'; UPDATE dp_setores SET company_id='${other}' WHERE id='${other}';`);
    await expect(db.query("select dp_preadmissao_ativar_rotina($1,'2026-10-12','{}'::jsonb)",[pa])).rejects.toThrow("Setor habitual incompatível");
    expect((await db.query("select count(*)::int total from dp_colaboradores")).rows).toEqual([{total:1}]);
  });
  it("notifica uma só vez mantendo a pessoa e o processo corretos em todos os alertas", async () => {
    await db.exec(`INSERT INTO dp_desligamento_processos SELECT '${process}',company_id,id,NULL FROM dp_colaboradores;`);
    for (const kind of ["d2","sug","prazo","venc","rev","falha"]) {
      for (let i=0;i<2;i++) await db.query("select dp_desligamento_notificar(p,true,'Alerta','Prazo em 18/10/2026',$1) from dp_desligamento_processos p",[`desl-${kind}:ficticio`]);
    }
    const rows = (await db.query<{colaborador_id:string;ref_id:string;titulo:string}>("select colaborador_id,ref_id,titulo from dp_notificacoes")).rows;
    expect(rows).toHaveLength(6);
    const person = (await db.query<{id:string}>("select id from dp_colaboradores")).rows[0]?.id;
    for (const row of rows) {
      expect(row.colaborador_id).toBe(person);
      expect(row.ref_id).toBe(process);
      expect(row.titulo.startsWith("PESSOA FICTÍCIA:")).toBe(true);
    }
  });
  it("não envia aviso ao portal antes da comunicação confirmada", async () => {
    await db.exec(`UPDATE dp_colaboradores SET user_id='${company}';`);
    await db.query("select dp_desligamento_notificar(p,false,'Aviso','Descrição','portal-ficticio') from dp_desligamento_processos p");
    expect((await db.query("select count(*)::int total from dp_notificacoes where para_admins=false")).rows).toEqual([{total:0}]);
  });
});