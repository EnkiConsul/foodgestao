// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const ana = "00000000-0000-4000-8000-000000000011";
const bia = "00000000-0000-4000-8000-000000000012";

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA private;
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY, nome text);
    INSERT INTO dp_colaboradores VALUES ('${ana}','Ana 12x36'),('${bia}','Bia Semanal');
    CREATE TABLE dp_colaborador_config_trabalho(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), colaborador_id uuid, folga_variavel boolean DEFAULT false,
      folga_fixa_dow smallint, vigencia_inicio date, vigencia_fim date, created_at timestamptz DEFAULT now());
    CREATE TABLE dp_colaborador_config_dias(config_id uuid, dow smallint, trabalha boolean);
    CREATE TABLE dp_trocas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), solicitante_id uuid, destino_id uuid, data_original date, data_proposta date, origem_registro text NOT NULL DEFAULT 'portal');
    CREATE TABLE dp_folgas(colaborador_id uuid, data date, status text DEFAULT 'agendada');
    CREATE TABLE dp_dia_trabalho_excepcional(colaborador_id uuid, data date);
    CREATE TABLE dp_solicitacoes(colaborador_id uuid, tipo text, status text, removido_em timestamptz, data_alvo date);
    CREATE TABLE dp_escalas(id uuid, status text);
    CREATE TABLE dp_escala_itens(escala_id uuid, colaborador_id uuid, data date, tipo text);
    CREATE FUNCTION private.dp_colab_afastado_em(uuid, date) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE FUNCTION public.dp_rotina_ausencia_operacional_em(uuid, date) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    SET check_function_bodies = off;
  `);
  await db.exec(readFileSync("drizzle/migrations/0226_escala_12x36_plantao_alternado.sql", "utf8"));
  await db.exec(`ALTER TABLE dp_folgas ADD COLUMN direito_origem text;`);
  await db.exec(readFileSync("drizzle/migrations/0228_escala_12x36_calendario_descanso.sql", "utf8"));
  // Ana: 12x36 com primeiro plantão em 10/11/2026 (gravado pela tela oficial).
  await db.exec(`
    SELECT set_config('app.dp_config_escala_explicita','on',false);
    INSERT INTO dp_colaborador_config_trabalho(colaborador_id, vigencia_inicio, escala_modelo, data_primeiro_plantao) VALUES ('${ana}','2026-11-01','12x36','2026-11-10');
    INSERT INTO dp_colaborador_config_trabalho(colaborador_id, vigencia_inicio) VALUES ('${bia}','2026-11-01');
    SELECT set_config('app.dp_config_escala_explicita','',false);
  `);
});
afterAll(async () => { await db.close(); });

const q = async <T,>(sql: string) => (await db.query<T>(sql)).rows[0];

describe("banco: ciclo 12x36", () => {
  it("10/11 plantão, 11/11 descanso; pessoa semanal fica fora do ciclo", async () => {
    const r = await q<{ a: boolean; b: boolean; c: boolean | null }>(
      `SELECT private.dp_12x36_plantao_em('${ana}','2026-11-10') a, private.dp_12x36_plantao_em('${ana}','2026-11-11') b, private.dp_12x36_plantao_em('${bia}','2026-11-11') c`,
    );
    expect(r).toEqual({ a: true, b: false, c: null });
  });
  it("descanso do ciclo conta como folga na rotina do portal", async () => {
    const r = await q<{ descanso: boolean; plantao: boolean }>(
      `SELECT public.dp_rotina_folga_em('${ana}','2026-11-11') descanso, public.dp_rotina_folga_em('${ana}','2026-11-12') plantao`,
    );
    expect(r).toEqual({ descanso: true, plantao: false });
  });
  it("trocar o descanso de 11/11 pelo plantão de 12/11 cola os plantões de 10/11 e 11/11", async () => {
    const r = await q<{ v: { colaborador_id: string; data_plantao: string; data_vizinha: string }[] }>(
      `SELECT private.dp_12x36_consecutivos('${ana}','${bia}','2026-11-11','2026-11-12') v`,
    );
    expect(r.v).toEqual([{ colaborador_id: ana, nome: "Ana 12x36", data_plantao: "2026-11-11", data_vizinha: "2026-11-10" }]);
  });
  it("troca pelo portal com plantões seguidos é recusada; a do gestor passa", async () => {
    await expect(db.query(`INSERT INTO dp_trocas(solicitante_id,destino_id,data_original,data_proposta) VALUES ('${ana}','${bia}','2026-11-11','2026-11-12')`))
      .rejects.toThrow(/TROCA_12X36_GESTOR/);
    await db.query(`INSERT INTO dp_trocas(solicitante_id,destino_id,data_original,data_proposta,origem_registro) VALUES ('${ana}','${bia}','2026-11-11','2026-11-12','gestor')`);
    expect((await q<{ n: number }>(`SELECT count(*)::int n FROM dp_trocas`)).n).toBe(1);
  });
  it("nova vigência criada por outra rotina mantém o 12x36 e a data do primeiro plantão", async () => {
    await db.query(`INSERT INTO dp_colaborador_config_trabalho(colaborador_id, vigencia_inicio, folga_fixa_dow) VALUES ('${ana}','2026-12-01',3)`);
    const r = await q<{ escala_modelo: string; data_primeiro_plantao: string; folga_fixa_dow: number | null }>(
      `SELECT escala_modelo, data_primeiro_plantao::text, folga_fixa_dow FROM dp_colaborador_config_trabalho WHERE colaborador_id='${ana}' AND vigencia_inicio='2026-12-01'`,
    );
    expect(r).toEqual({ escala_modelo: "12x36", data_primeiro_plantao: "2026-11-10", folga_fixa_dow: null });
  });
  it("dia gravado como folga na grade do 12x36 vira dia do plantão", async () => {
    await db.query(`INSERT INTO dp_colaborador_config_dias(config_id,dow,trabalha) SELECT id,0,false FROM dp_colaborador_config_trabalho WHERE colaborador_id='${ana}' AND vigencia_inicio='2026-11-01'`);
    expect((await q<{ trabalha: boolean }>(`SELECT trabalha FROM dp_colaborador_config_dias`)).trabalha).toBe(true);
  });
  it("12x36 sem data do primeiro plantão é recusado", async () => {
    await expect(db.query(`SELECT set_config('app.dp_config_escala_explicita','on',false); `).then(() =>
      db.query(`INSERT INTO dp_colaborador_config_trabalho(colaborador_id, vigencia_inicio, escala_modelo) VALUES ('${bia}','2027-01-01','12x36')`))).rejects.toThrow(/12x36_primeiro/);
  });
});

describe("banco: 12x36 sem compensatória de feriado (Art. 59-A, parágrafo único)", () => {
  it("recusa folga compensatória de feriado para quem está em 12x36", async () => {
    await expect(
      db.query(`INSERT INTO dp_folgas(colaborador_id, data, direito_origem) VALUES ('${ana}','2026-11-15','compensacao_feriado')`),
    ).rejects.toThrow(/COMPENSACAO_INELEGIVEL/);
  });
  it("aceita a compensatória de quem está na escala semanal", async () => {
    await db.query(`INSERT INTO dp_folgas(colaborador_id, data, direito_origem) VALUES ('${bia}','2026-11-15','compensacao_feriado')`);
    const r = await q<{ n: number }>(`SELECT count(*)::int n FROM dp_folgas WHERE colaborador_id='${bia}' AND direito_origem='compensacao_feriado'`);
    expect(r.n).toBe(1);
  });
  it("folga comum de quem está em 12x36 continua permitida", async () => {
    await db.query(`INSERT INTO dp_folgas(colaborador_id, data) VALUES ('${ana}','2026-11-16')`);
    const r = await q<{ n: number }>(`SELECT count(*)::int n FROM dp_folgas WHERE colaborador_id='${ana}' AND data='2026-11-16'`);
    expect(r.n).toBe(1);
  });
});
