// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${actor}''::uuid';
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT current_setting(''test.allowed'',true) = ''yes''';
    CREATE TYPE dp_ocorrencia_marcacao AS ENUM ('entrada','intervalo_inicio','intervalo_retorno','saida');
    CREATE TYPE dp_ocorrencia_tratativa_status AS ENUM ('pendente','concluida','nao_se_aplica');
    CREATE TYPE dp_ocorrencia_analise_status AS ENUM ('pendente','analisada');
    CREATE TABLE dp_ocorrencias(id uuid PRIMARY KEY,company_id uuid,tipo text,estado text,horario_real time,marcacao_alvo dp_ocorrencia_marcacao,justificativa_inicial text,tratativa_ponto boolean,tratativa_status dp_ocorrencia_tratativa_status,tratativa_decisao text,tratativa_observacao text,analise_status dp_ocorrencia_analise_status,analisado_por uuid,analisado_em timestamptz,lancado_ponto_em timestamptz,lancado_ponto_por uuid);
    CREATE TABLE dp_ocorrencia_eventos(company_id uuid,ocorrencia_id uuid,tipo_evento text,campo text,valor_anterior text,valor_novo text,metadata jsonb,autor_id uuid);
  `);
  await db.exec(readFileSync("drizzle/migrations/0165_ocorrencia_edicao_marcacao_auditada.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`SET test.allowed='yes'; DELETE FROM dp_ocorrencia_eventos; DELETE FROM dp_ocorrencias;
    INSERT INTO dp_ocorrencias(id,company_id,tipo,estado,horario_real,marcacao_alvo,justificativa_inicial,tratativa_status,analise_status,lancado_ponto_em)
    VALUES('${id}','${actor}','esquecimento_marcacao','confirmada','18:45','intervalo_retorno','Relato original','pendente','pendente',now());`);
});
afterAll(() => db.close());
const salvar = (concluir = false, motivo = "Conferido com colaboradora", anterior = "18:45") => db.query(
  "SELECT dp_ocorrencia_editar_registro($1,'18:45','saida',$2,$3,'intervalo_retorno',$4)", [id,motivo,anterior,concluir]);
describe.sequential("edição auditada do fato", () => {
  it("corrige a marcação preservando relato e decisão pendente", async () => {
    await salvar();
    expect((await db.query("SELECT marcacao_alvo,horario_real,justificativa_inicial,tratativa_status,lancado_ponto_em FROM dp_ocorrencias")).rows).toEqual([{marcacao_alvo:"saida",horario_real:"18:45:00",justificativa_inicial:"Relato original",tratativa_status:"pendente",lancado_ponto_em:null}]);
    const evento = (await db.query<{autor_id:string;valor_anterior:string;valor_novo:string}>("SELECT autor_id,valor_anterior,valor_novo FROM dp_ocorrencia_eventos")).rows[0];
    expect(evento?.autor_id).toBe(actor);
    expect(JSON.parse(evento?.valor_anterior ?? "{}").marcacao_alvo).toBe("intervalo_retorno");
    expect(JSON.parse(evento?.valor_novo ?? "{}").marcacao_alvo).toBe("saida");
  });
  it("conclui conferência na mesma transação somente quando solicitado", async () => {
    await salvar(true);
    expect((await db.query("SELECT tratativa_status,analise_status,analisado_por FROM dp_ocorrencias")).rows).toEqual([{tratativa_status:"concluida",analise_status:"analisada",analisado_por:actor}]);
  });
  it("recusa quem não é gestor da empresa", async () => {
    await db.exec("SET test.allowed='no'");
    await expect(salvar()).rejects.toThrow("OCORRENCIA_SEM_PERMISSAO");
    expect((await db.query("SELECT * FROM dp_ocorrencia_eventos")).rows).toHaveLength(0);
  });
  it("exige motivo com três caracteres", async () => {
    await expect(salvar(false,"ab")).rejects.toThrow("OCORRENCIA_MOTIVO_OBRIGATORIO");
  });
  it("recusa edição sobre dados alterados em outro aparelho", async () => {
    await expect(salvar(false, "Conferido", "18:40")).rejects.toThrow("OCORRENCIA_REGISTRO_DESATUALIZADO");
  });
  it("não edita ocorrência cancelada", async () => {
    await db.exec("UPDATE dp_ocorrencias SET estado='cancelada'");
    await expect(salvar()).rejects.toThrow("OCORRENCIA_CANCELADA");
  });
});