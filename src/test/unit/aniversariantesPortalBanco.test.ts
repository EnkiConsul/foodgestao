// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
    CREATE FUNCTION public.dp_colaborador_ativo_of(u uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT u WHERE u='${uuid(1)}'::uuid $$;
    CREATE TABLE public.dp_unidades(id uuid,company_id uuid,nome text);
    CREATE TABLE public.dp_colaboradores(id uuid,company_id uuid,unidade_id uuid,nome text,cargo text,data_nascimento date,data_admissao date,data_base_contagem date,regime text,vinculo_label text,origem_cadastro text,ativo boolean,deleted_at timestamptz);
    INSERT INTO dp_unidades VALUES('${uuid(10)}','${uuid(20)}','Unidade teste');
    INSERT INTO dp_colaboradores VALUES
      ('${uuid(1)}','${uuid(20)}','${uuid(10)}','Eu','Cargo','1990-10-12','2020-10-01',NULL,'clt',NULL,NULL,true,NULL),
      ('${uuid(2)}','${uuid(20)}','${uuid(10)}','Colega','Cargo','1980-10-12','2025-10-03',NULL,'clt',NULL,NULL,true,NULL),
      ('${uuid(3)}','${uuid(20)}','${uuid(10)}','Provisória','Cargo','2000-10-12','2020-10-12',NULL,'freelancer',NULL,'preadmissao_rotina',true,NULL),
      ('${uuid(4)}','${uuid(21)}','${uuid(10)}','Outra empresa','Cargo','1980-10-12','2020-10-01',NULL,'clt',NULL,NULL,true,NULL),
      ('${uuid(5)}','${uuid(20)}','${uuid(11)}','Outra unidade','Cargo','1980-10-12','2020-10-01',NULL,'clt',NULL,NULL,true,NULL),
      ('${uuid(6)}','${uuid(20)}','${uuid(10)}','Zero anos','Cargo','1980-10-12','2026-10-01',NULL,'clt',NULL,NULL,true,NULL),
      ('${uuid(7)}','${uuid(20)}','${uuid(10)}','Convertido','Cargo',NULL,'2020-10-01','2025-10-15','clt',NULL,NULL,true,NULL),
      ('${uuid(8)}','${uuid(20)}','${uuid(10)}','Recontratado','Cargo',NULL,'2025-10-18','2020-10-01','clt',NULL,NULL,true,NULL);`);
  await db.exec(readFileSync("drizzle/migrations/0161_portal_aniversariantes_privacidade.sql","utf8"));
  await db.exec(`SET app.actor='${uuid(1)}';`);
},30000);
afterAll(() => db.close());
describe.sequential("aniversariantes com privacidade no servidor", () => {
  it("não devolve idade nem ano de nascimento para colegas", async () => {
    const { rows } = await db.query<Record<string,unknown>>("select * from dp_portal_aniversariantes('2026-10') where tipo='nascimento'");
    expect(rows.map((r) => r.nome)).toContain("Provisória");
    for (const r of rows) { expect(r.anos_casa).toBeNull(); expect(Object.keys(r)).not.toContain("data_nascimento"); expect(r.data_evento).toBe("2026-10-12"); }
  });
  it("isola empresa e unidade pela sessão", async () => {
    const { rows } = await db.query<{nome:string}>("select nome from dp_portal_aniversariantes('2026-10')");
    expect(rows.some((r) => r.nome==='Outra empresa'||r.nome==='Outra unidade')).toBe(false);
    expect(rows.some((r) => r.nome==='Colega')).toBe(true);
  });
  it("não comemora provisório ou zero anos", async () => {
    const { rows } = await db.query<{nome:string}>("select nome from dp_portal_aniversariantes('2026-10') where tipo='contratacao'");
    expect(rows.some((r) => r.nome==='Provisória'||r.nome==='Zero anos')).toBe(false);
  });
  it("conversão conta só o período formal", async () => {
    expect((await db.query("select anos_casa,data_evento from dp_portal_aniversariantes('2026-10') where nome='Convertido'")).rows).toEqual([{anos_casa:1,data_evento:'2026-10-15'}]);
  });
  it("recontratação não soma contrato anterior", async () => {
    expect((await db.query("select anos_casa,data_evento from dp_portal_aniversariantes('2026-10') where nome='Recontratado'")).rows).toEqual([{anos_casa:1,data_evento:'2026-10-18'}]);
  });
  it("nega visitante", async () => {
    await db.exec('SET ROLE anon');
    await expect(db.query("select * from dp_portal_aniversariantes('2026-10')")).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });
  it("sem vínculo ativo não devolve colegas", async () => {
    await db.exec(`SET app.actor='${uuid(9)}';`);
    expect((await db.query("select * from dp_portal_aniversariantes('2026-10')")).rows).toEqual([]);
  });
});