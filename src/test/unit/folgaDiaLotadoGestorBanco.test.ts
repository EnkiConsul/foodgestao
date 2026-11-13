// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco isolado com pessoas fictícias: no mês em curso o colaborador nunca marca
// direto em dia lotado (nem sem folga no mês); o pedido vai ao gestor, que pode
// aprovar acima do limite. Pedido que perdeu efeito não gera folga dupla.
const MIG = process.env.MIG_FOLGA_LOTADO ?? "drizzle/migrations/0239_folga_dia_lotado_pede_gestor.sql";
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });

const empresa = "50000000-0000-4000-8000-000000000001";
const gestor = "5a000000-0000-4000-8000-000000000001";
const un = (n: number) => `50000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const colab = (n: number) => `51000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const user = (n: number) => `52000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const [ano, mes] = hoje.split("-").map(Number);
const fdsFuturos: string[] = [];
for (let d = new Date(ano, mes - 1, 1); d.getMonth() === mes - 1; d.setDate(d.getDate() + 1)) {
  if ((d.getDay() === 0 || d.getDay() === 6) && iso(d) > hoje) fdsFuturos.push(iso(d));
}
const [lotado, livre] = fdsFuturos;
const semDatas = fdsFuturos.length < 2;

async function como(uid: string) {
  await db.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
}
async function erroDe(sql: string, params: unknown[] = []) {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return String((e as Error).message);
  }
}
async function folgasDe(c: string) {
  return (await db.query<{ data: string; extra: boolean; observacao: string | null }>(
    `SELECT data::text, extra, observacao FROM dp_folgas WHERE colaborador_id=$1 AND status<>'cancelada' ORDER BY data`, [c],
  )).rows;
}
async function pessoa(n: number, unidade: number) {
  await db.query(`INSERT INTO dp_colaboradores(id,company_id,unidade_id,nome,user_id) VALUES($1,$2,$3,$4,$5)`,
    [colab(n), empresa, un(unidade), `Pessoa ${n}`, user(n)]);
}
async function folgaDireta(c: string, data: string) {
  await db.query(`SELECT set_config('dp.folga_excedente_autorizado','on',false)`);
  await db.query(`INSERT INTO dp_folgas(company_id,colaborador_id,data,tipo,origem,status) VALUES($1,$2,$3,'normal','auto_fechamento_periodo','agendada')`, [empresa, c, data]);
  await db.query(`SELECT set_config('dp.folga_excedente_autorizado','off',false)`);
}

beforeAll(async () => {
  const proxMes = iso(new Date(ano, mes, 1));
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    CREATE TYPE dp_folga_tipo AS ENUM ('normal','ferias','licenca');
    CREATE TYPE dp_folga_origem AS ENUM ('solicitacao','troca','auto_fechamento_periodo');
    CREATE TYPE dp_folga_status AS ENUM ('agendada','cancelada');
    CREATE TYPE dp_solicitacao_status AS ENUM ('pendente','aprovada','recusada','cancelada');
    CREATE TYPE dp_solicitacao_tipo AS ENUM ('folga');
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,cargo_id uuid,setor_id uuid,nome text,nome_social text,user_id uuid);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo dp_folga_tipo,origem dp_folga_origem,status dp_folga_status,extra boolean DEFAULT false,observacao text,criado_por uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE dp_solicitacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,criado_por uuid,tipo dp_solicitacao_tipo,data_alvo date,data_fim date,motivo text,status dp_solicitacao_status,fora_da_janela boolean DEFAULT false,removido_em timestamptz,respondido_por uuid,respondido_em timestamptz,resposta_admin text,updated_at timestamptz);
    CREATE TABLE dp_dia_trabalho_excepcional(company_id uuid,colaborador_id uuid,data date,origem text,solicitacao_id uuid,criado_por uuid,UNIQUE(colaborador_id,data));
    CREATE TABLE dp_datas_bloqueadas(company_id uuid,data date,unidade_id uuid,liberada_por_solicitacao uuid,liberada boolean);
    CREATE TABLE dp_bloqueios(company_id uuid,colaborador_id uuid,ativo boolean,tipo text,inicio date,fim date);
    CREATE TABLE dp_dia_config(company_id uuid,data date,unidade_id uuid,limite_folgas int);
    CREATE FUNCTION private.dp_folga_portal_exigir_liberada() RETURNS void LANGUAGE sql AS 'SELECT';
    CREATE FUNCTION private.is_company_admin_or_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${gestor}'::uuid $$;
    CREATE FUNCTION dp_colaborador_ativo_of(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT id FROM dp_colaboradores WHERE user_id = $1';
    CREATE FUNCTION dp_regra_bloqueia_data(uuid,uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE FUNCTION dp_dias_fixos_folga(uuid,date) RETURNS smallint[] LANGUAGE sql AS 'SELECT ''{}''::smallint[]';
    -- Janela do mês seguinte aberta; sábado e domingo valem como folga do mês.
    CREATE FUNCTION dp_folgas_janela_efetiva(uuid,uuid,date) RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('ativa',true,'estado','aberta','competencia','${proxMes}','folgas_exigidas',1) $$;
    CREATE FUNCTION dp_folga_dias_fds_aplicaveis(uuid,uuid) RETURNS int[] LANGUAGE sql AS 'SELECT ARRAY[0,6]';
    CREATE FUNCTION dp_folga_exige_descanso_fds(uuid,uuid,int[],date) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION dp_folga_conflito_colaboradores(uuid,uuid,date) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"conflito":false}''::jsonb';
    CREATE FUNCTION dp_folga_marcadas_no_mes(_company uuid, _colab uuid, _competencia date, _dias integer[]) RETURNS integer LANGUAGE sql AS $$
      SELECT count(*)::int FROM dp_folgas f
       WHERE f.colaborador_id = _colab AND f.status <> 'cancelada' AND f.extra = false AND f.tipo NOT IN ('ferias','licenca')
         AND date_trunc('month', f.data) = date_trunc('month', _competencia)
         AND EXTRACT(DOW FROM f.data)::int = ANY (_dias) $$;
    -- Uma vaga por dia em cada unidade.
    CREATE FUNCTION dp_folga_limite_dia(p_company uuid,p_unidade uuid,p_cargo uuid,p_data date,p_ignorar uuid DEFAULT NULL,p_setor uuid DEFAULT NULL)
      RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('limite',1,'excedido',(SELECT count(*) FROM dp_folgas f JOIN dp_colaboradores c ON c.id=f.colaborador_id
        WHERE c.unidade_id=p_unidade AND f.data=p_data AND f.status<>'cancelada' AND f.extra=false
          AND f.colaborador_id IS DISTINCT FROM p_ignorar) >= 1) $$;
    -- Guarda do limite na gravação: só passa com a autorização explícita.
    CREATE FUNCTION trava_limite() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT NEW.extra AND COALESCE(current_setting('dp.folga_excedente_autorizado', true), 'off') <> 'on'
         AND COALESCE((dp_folga_limite_dia(NEW.company_id,(SELECT unidade_id FROM dp_colaboradores WHERE id=NEW.colaborador_id),NULL,NEW.data,NEW.colaborador_id)->>'excedido')::boolean,false) THEN
        RAISE EXCEPTION 'TRAVA_LIMITE';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trava_limite BEFORE INSERT ON dp_folgas FOR EACH ROW EXECUTE FUNCTION trava_limite();
  `);
  await db.exec(readFileSync(MIG, "utf8"));
  await db.exec(`CREATE TRIGGER dp_solicitacoes_validar BEFORE INSERT ON dp_solicitacoes FOR EACH ROW EXECUTE FUNCTION dp_validar_solicitacao_folga();`);
  // Em cada unidade um colega já ocupa a única vaga do dia "lotado".
  for (const u of [1, 2, 3, 4]) {
    await pessoa(90 + u, u);
    await folgaDireta(colab(90 + u), lotado ?? `${ano}-01-01`);
    // Dia lotado também no limite configurado do dia (dp_dia_config).
    await db.query(`INSERT INTO dp_dia_config VALUES($1,$2,$3,1)`, [empresa, lotado ?? `${ano}-01-01`, un(u)]);
  }
}, 30000);
afterAll(() => db.close());

describe.skipIf(semDatas)("folga em dia lotado no mês em curso", () => {
  it("quem está sem folga no mês não marca direto em dia lotado; o pedido vai ao gestor, que aprova acima do limite", async () => {
    await pessoa(1, 1);
    await como(user(1));
    const erro = await erroDe(`SELECT dp_folga_marcar($1)`, [lotado]);
    expect(erro).toContain("FOLGA_LIMITE_DIA");
    expect(await folgasDe(colab(1))).toEqual([]);

    await db.query(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [lotado]);
    const pedido = (await db.query<{ id: string; status: string; excede_limite_dia: boolean; fora_da_janela: boolean }>(
      `SELECT id::text, status::text, excede_limite_dia, fora_da_janela FROM dp_solicitacoes WHERE colaborador_id=$1`, [colab(1)],
    )).rows;
    expect(pedido).toHaveLength(1);
    expect(pedido[0]).toMatchObject({ status: "pendente", excede_limite_dia: true, fora_da_janela: false });
    expect(await folgasDe(colab(1))).toEqual([]);

    // Segundo pedido no mesmo mês fica barrado enquanto o primeiro está com o gestor.
    expect(await erroDe(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [livre])).toContain("FOLGA_MES_PEDIDO_PENDENTE");

    await como(gestor);
    await db.query(`SELECT dp_solicitacao_responder($1::uuid, 'aprovada', NULL)`, [pedido[0].id]);
    const folgas = await folgasDe(colab(1));
    expect(folgas).toHaveLength(1);
    expect(folgas[0]).toMatchObject({ data: lotado, extra: false });
    expect(folgas[0].observacao).toContain("acima do limite");
    expect((await db.query<{ v: string }>(`SELECT current_setting('dp.folga_excedente_autorizado', true) v`)).rows[0].v).toBe("off");
  });

  it("dia com vaga não vira pedido: a folga é marcada direto", async () => {
    await pessoa(2, 2);
    await como(user(2));
    expect(await erroDe(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [livre])).toContain("FOLGA_COM_VAGA");
  });

  it("quem já tem a folga de fim de semana do mês não pode pedir dia lotado", async () => {
    await pessoa(3, 3);
    await folgaDireta(colab(3), livre);
    await como(user(3));
    expect(await erroDe(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [lotado])).toContain("FOLGA_MES_SEM_DIREITO");
  });

  it("marcar direto num dia com vaga cancela o pedido do dia lotado; aprovar depois que a folga saiu é recusado", async () => {
    await pessoa(4, 4);
    await como(user(4));
    await db.query(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [lotado]);
    await db.query(`SELECT dp_folga_marcar($1)`, [livre]);
    const status = (await db.query<{ status: string }>(`SELECT status::text FROM dp_solicitacoes WHERE colaborador_id=$1`, [colab(4)])).rows;
    expect(status.map((s) => s.status)).toEqual(["cancelada"]);

    // Pedido ainda pendente quando a distribuição automática já deu a folga do mês.
    await pessoa(5, 4);
    await como(user(5));
    await db.query(`SELECT dp_folga_solicitar_mes_lotado($1, NULL)`, [lotado]);
    const pedido = (await db.query<{ id: string }>(`SELECT id::text FROM dp_solicitacoes WHERE colaborador_id=$1`, [colab(5)])).rows[0];
    await folgaDireta(colab(5), fdsFuturos[2] ?? livre);
    await como(gestor);
    expect(await erroDe(`SELECT dp_solicitacao_responder($1::uuid, 'aprovada', NULL)`, [pedido.id])).toContain("FOLGA_MES_JA_RESOLVIDA");
    expect(await folgasDe(colab(5))).toHaveLength(1);
  });
});
