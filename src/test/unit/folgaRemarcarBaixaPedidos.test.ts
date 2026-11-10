// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco isolado com pessoas fictícias: confere que mudar a folga direto
// encerra, na mesma transação, o pedido ao gestor que perdeu o sentido.
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "20000000-0000-4000-8000-000000000001";
const eu = "20000000-0000-4000-8000-000000000002";
const colega = "20000000-0000-4000-8000-000000000003";
const unidade = "20000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${eu}''::uuid';
    CREATE TYPE dp_folga_tipo AS ENUM ('normal','compensatoria');
    CREATE TYPE dp_folga_origem AS ENUM ('solicitacao','admin');
    CREATE TYPE dp_folga_status AS ENUM ('agendada','cancelada');
    CREATE TYPE dp_notificacao_tipo AS ENUM ('folga_remarcada');
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,cargo_id uuid,setor_id uuid,nome text);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo dp_folga_tipo,origem dp_folga_origem,status dp_folga_status,extra boolean,criado_por uuid,observacao text,direito_origem text,created_at timestamptz DEFAULT now());
    CREATE TABLE dp_solicitacoes(id uuid PRIMARY KEY,colaborador_id uuid,tipo text,status text,data_alvo date,data_fim date,motivo text,removido_em timestamptz,resposta_admin text,updated_at timestamptz);
    CREATE TABLE dp_datas_bloqueadas(id uuid,company_id uuid,unidade_id uuid,data date,liberada boolean);
    CREATE TABLE dp_notificacoes(company_id uuid,tipo dp_notificacao_tipo,titulo text,descricao text,ref_table text,ref_id uuid,para_admins boolean);
    CREATE FUNCTION dp_colaborador_ativo_of(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT $1';
    CREATE FUNCTION dp_dias_descanso_validos(uuid,uuid) RETURNS smallint[] LANGUAGE sql AS 'SELECT ARRAY[0,6]::smallint[]';
    CREATE FUNCTION dp_folga_limite_dia(uuid,uuid,uuid,date,uuid,uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"excedido":false}''::jsonb';
    CREATE FUNCTION dp_folga_conflito_colaboradores(uuid,uuid,date) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"conflito":false}''::jsonb';
    INSERT INTO dp_colaboradores VALUES('${eu}','${company}','${unidade}',NULL,NULL,'Pessoa fictícia');
    INSERT INTO dp_folgas(company_id,colaborador_id,data,tipo,origem,status,direito_origem)
      VALUES('${company}','${eu}','2099-12-27','normal','admin','agendada','fds');
    INSERT INTO dp_solicitacoes(id,colaborador_id,tipo,status,data_alvo,data_fim,motivo) VALUES
      ('30000000-0000-4000-8000-000000000001','${eu}','folga','pendente','2099-12-26','2099-12-27','MUDANCA_DE_FOLGA'),
      ('30000000-0000-4000-8000-000000000002','${eu}','folga','pendente','2099-12-05',NULL,'Folga extra'),
      ('30000000-0000-4000-8000-000000000003','${colega}','folga','pendente','2099-12-19','2099-12-27','MUDANCA_DE_FOLGA');
  `);
  await db.exec(readFileSync("drizzle/migrations/0211_folga_remarcar_baixa_pedidos.sql", "utf8"));
}, 30000);
afterAll(() => db.close());

describe("mudança direta da folga encerra pedido órfão", () => {
  it("cancela só o meu pedido de mudança da mesma folga", async () => {
    const r = await db.query<{ r: { pedidos_cancelados: number } }>(
      `SELECT dp_folga_remarcar('2099-12-19','2099-12-12') AS r`,
    ).catch(() => null);
    // Folga de 19/12 não existe: nada muda e nenhum pedido é cancelado.
    expect(r).toBeNull();

    const ok = await db.query<{ r: { pedidos_cancelados: number } }>(`SELECT dp_folga_remarcar('2099-12-27','2099-12-20') AS r`);
    expect(ok.rows[0].r.pedidos_cancelados).toBe(1);

    const rows = (await db.query<{ id: string; status: string; resposta_admin: string | null }>(
      `SELECT id::text, status, resposta_admin FROM dp_solicitacoes ORDER BY id`,
    )).rows;
    expect(rows.map((x) => x.status)).toEqual(["cancelada", "pendente", "pendente"]);
    expect(rows[0].resposta_admin).toContain("27/12/2099 para 20/12/2099");
    const folgas = (await db.query<{ data: string }>(`SELECT data::text FROM dp_folgas`)).rows;
    expect(folgas.map((f) => f.data)).toEqual(["2099-12-20"]);
  });
});
