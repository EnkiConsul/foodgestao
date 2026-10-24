// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const id = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE dp_preadmissoes(id uuid PRIMARY KEY, company_id uuid, status text, versao integer, removido_em timestamptz,
      dados jsonb, admin_dados jsonb, cpf text, email text, data_nascimento date, estado_civil text, correcao_motivo text,
      cargo_previsto_id uuid, unidade_prevista_id uuid, trabalho_apos_22h boolean, enviado_em timestamptz,
      revisado_em timestamptz, revisado_por uuid, contabilidade_enviado_em timestamptz,contabilidade_retorno_em timestamptz,
      ficha_oficial_conferida_em timestamptz,ficha_oficial_conferida_por uuid,updated_at timestamptz);
    CREATE TABLE dp_preadmissao_convites(id uuid PRIMARY KEY,preadmissao_id uuid,company_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE dp_preadmissao_eventos(preadmissao_id uuid,company_id uuid,evento text,detalhe jsonb,actor_user_id uuid);`);
  for (const [file, name] of [
    ["supabase/migrations/20260916235105_aa1beca9-7e3c-4d3e-854b-fc5ac75f1247.sql", "dp_preadmissao_transicionar"],
    ["supabase/migrations/20260917004500_7977ed41-c3b2-46cd-9003-afb90a60d56d.sql", "dp_preadmissao_transicionar_versionado"],
  ]) {
    const sql = readFileSync(file, "utf8");
    const fn = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"))?.[0];
    if (!fn) throw new Error(`Função ausente: ${name}`);
    await db.exec(fn);
  }
  await db.exec(readFileSync("drizzle/migrations/0144_preadmissao_correcao_retomada_atomica.sql", "utf8"));
}, 30000);
afterAll(() => db.close());

async function reset(status = "aguardando_revisao", prazo = "now()+interval '1 day'") {
  await db.exec(`DELETE FROM dp_preadmissao_eventos; DELETE FROM dp_preadmissao_convites; DELETE FROM dp_preadmissoes;
    INSERT INTO dp_preadmissoes(id,company_id,status,versao,dados,admin_dados,correcao_motivo) VALUES('${id}','${actor}','${status}',3,'{"nome":"PESSOA FICTÍCIA"}','{"rotina":{"colaborador_id":"preservado"}}','Ajustar identidade');
    INSERT INTO dp_preadmissao_convites(id,preadmissao_id,company_id,token_hash,expires_at) VALUES('${actor}','${id}','${actor}','hash-ficticio',${prazo});`);
}
async function run(action: string, version = 3) {
  return (await db.query<{r: {ok: boolean; motivo?: string}}>("select dp_preadmissao_correcao_gestor($1,$2,$3,$4,$5) r", [id,actor,action,"Recebido na loja",version])).rows[0]?.r;
}
describe.sequential("correção e retomada atômicas", () => {
  it("renova o mesmo link por pelo menos sete dias e audita o ator", async () => {
    await reset(); expect((await run("solicitar"))?.ok).toBe(true);
    expect((await db.query("select token_hash,expires_at >= now()+interval '7 days'-interval '2 seconds' prazo from dp_preadmissao_convites")).rows).toEqual([{token_hash:"hash-ficticio",prazo:true}]);
    expect((await db.query("select status,versao,dados,admin_dados from dp_preadmissoes")).rows[0]).toMatchObject({status:"correcao_solicitada",versao:4,dados:{nome:"PESSOA FICTÍCIA"},admin_dados:{rotina:{colaborador_id:"preservado"}}});
    expect((await db.query("select evento,actor_user_id from dp_preadmissao_eventos")).rows).toEqual([{evento:"correcao_solicitada",actor_user_id:actor}]);
  });
  it("não encurta prazo existente maior", async () => {
    await reset("aguardando_revisao","now()+interval '30 days'"); await run("solicitar");
    expect((await db.query("select expires_at > now()+interval '29 days' prazo from dp_preadmissao_convites")).rows).toEqual([{prazo:true}]);
  });
  it.each(["correcao_solicitada","aguardando_nova_versao"])("retoma %s sem aprovar nem efetivar", async (status) => {
    await reset(status); expect((await run("retomar"))?.ok).toBe(true);
    expect((await db.query("select status,versao,correcao_motivo from dp_preadmissoes")).rows).toEqual([{status:"aguardando_revisao",versao:4,correcao_motivo:null}]);
    expect((await db.query("select evento,detalhe->>'correcao_anterior' anterior from dp_preadmissao_eventos")).rows).toEqual([{evento:"conferencia_retomada_gestor",anterior:"Ajustar identidade"}]);
  });
  it("recusa versão antiga sem alterar status", async () => {
    await reset("correcao_solicitada"); expect((await run("retomar",2))?.motivo).toBe("versao_alterada");
    expect((await db.query("select status,versao from dp_preadmissoes")).rows).toEqual([{status:"correcao_solicitada",versao:3}]);
  });
  it("não reativa convite revogado nem devolve ficha sem link", async () => {
    await reset(); await db.exec("update dp_preadmissao_convites set revoked_at=now()");
    expect((await run("solicitar"))?.motivo).toBe("convite_revogado");
    expect((await db.query("select status from dp_preadmissoes")).rows).toEqual([{status:"aguardando_revisao"}]);
  });
});