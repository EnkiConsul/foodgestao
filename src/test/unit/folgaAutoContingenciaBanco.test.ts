// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco isolado com pessoas fictícias: a distribuição automática nunca deixa
// alguém sem folga de fim de semana (contingência acima do limite começando
// pelos últimos dias), aceita sábado quando a unidade negociou sábado e domingo,
// reavalia quem entrou depois e, no mês corrente, só usa datas futuras.
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });

const empresaA = "40000000-0000-4000-8000-000000000001";
const unidadeA = "40000000-0000-4000-8000-0000000000a1";
const empresaB = "40000000-0000-4000-8000-000000000002";
const unidadeSabDom = "40000000-0000-4000-8000-0000000000b1";
const unidadeSoDom = "40000000-0000-4000-8000-0000000000b2";
const empresaC = "40000000-0000-4000-8000-000000000003";
const unidadeC = "40000000-0000-4000-8000-0000000000c1";

const colega = "41000000-0000-4000-8000-000000000001";
const ana = "41000000-0000-4000-8000-000000000002";
const bia = "41000000-0000-4000-8000-000000000003";
const sabado = "41000000-0000-4000-8000-000000000004";
const soSabadoSemAcordo = "41000000-0000-4000-8000-000000000005";
const atual1 = "41000000-0000-4000-8000-000000000006";
const novata = "41000000-0000-4000-8000-000000000007";
const empresaD = "40000000-0000-4000-8000-000000000004";
const unidadeD = "40000000-0000-4000-8000-0000000000d1";
const colegaD = "41000000-0000-4000-8000-000000000008";
const semVaga = "41000000-0000-4000-8000-000000000009";

const MIG_0238 = "drizzle/migrations/0238_folga_reavaliacao_conservadora.sql";
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fdsDoMes = (ano: number, mes0: number) => {
  const out: string[] = [];
  for (let d = new Date(ano, mes0, 1); d.getMonth() === mes0; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) out.push(iso(d));
  }
  return out;
};

const hojeBrt = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // YYYY-MM-DD
};

async function folgasDe(colab: string, inicio: string, fim: string) {
  return (await db.query<{ data: string }>(
    `SELECT data::text FROM dp_folgas WHERE colaborador_id=$1 AND status<>'cancelada' AND data BETWEEN $2 AND $3 ORDER BY data`,
    [colab, inicio, fim],
  )).rows.map((r) => r.data);
}

async function colaborador(id: string, company: string, unidade: string, nome: string, diasTrab: number[]) {
  await db.query(
    `INSERT INTO dp_colaboradores(id,company_id,unidade_id,nome,regime,forma_pagamento) VALUES($1,$2,$3,$4,'clt','mensalista')`,
    [id, company, unidade, nome],
  );
  const cfg = (await db.query<{ id: string }>(
    `INSERT INTO dp_colaborador_config_trabalho(colaborador_id,company_id,vigencia_inicio) VALUES($1,$2,'2020-01-01') RETURNING id::text`,
    [id, company],
  )).rows[0].id;
  for (const dow of diasTrab) {
    await db.query(`INSERT INTO dp_colaborador_config_dias(config_id,dow,trabalha) VALUES($1,$2,true)`, [cfg, dow]);
  }
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TYPE dp_folga_tipo AS ENUM ('normal','ferias','licenca');
    CREATE TYPE dp_folga_origem AS ENUM ('solicitacao','auto_fechamento_periodo');
    CREATE TYPE dp_folga_status AS ENUM ('agendada','cancelada');
    CREATE TYPE dp_notificacao_tipo AS ENUM ('folga_acima_limite','folga_pendentes_gestor');
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY,company_id uuid,unidade_id uuid,cargo_id uuid,nome text,regime text,vinculo_label text,forma_pagamento text,deleted_at timestamptz,ativo boolean DEFAULT true,data_admissao date);
    CREATE TABLE dp_colaborador_config_trabalho(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),colaborador_id uuid,company_id uuid,vigencia_inicio date,vigencia_fim date,escala_modelo text DEFAULT 'semanal',folga_fixa_dow int);
    CREATE TABLE dp_colaborador_config_dias(config_id uuid,dow int,trabalha boolean);
    CREATE TABLE dp_ferias_gozos(colaborador_id uuid,status text,data_inicio date,data_fim date);
    CREATE TABLE dp_folgas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo dp_folga_tipo,origem dp_folga_origem,status dp_folga_status,extra boolean DEFAULT false,observacao text,criado_por uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE dp_solicitacoes(company_id uuid,colaborador_id uuid,tipo text,status text,data_alvo date);
    CREATE TABLE dp_desligamento_processos(colaborador_id uuid,status text,ultimo_comparecimento date);
    CREATE TABLE dp_folga_limite_regras(id uuid,company_id uuid,ativo boolean,tipo text,vigencia_inicio date,vigencia_fim date);
    CREATE TABLE dp_folga_limite_regra_colaboradores(regra_id uuid,colaborador_id uuid);
    CREATE TABLE dp_notificacoes(id uuid DEFAULT gen_random_uuid(),company_id uuid,tipo dp_notificacao_tipo,titulo text,descricao text,ref_table text,ref_id uuid,para_admins boolean,chave text);
    CREATE UNIQUE INDEX dp_notificacoes_chave_uidx ON dp_notificacoes(chave) WHERE chave IS NOT NULL;
    CREATE TABLE dp_folga_autoatribuicao_execucoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,unidade_id uuid,competencia date,status text,iniciada_em timestamptz,concluida_em timestamptz,quantidade_gerada int,quantidade_excedida int,detalhes jsonb,erro text,manual boolean,executada_por uuid,updated_at timestamptz);
    CREATE TABLE dias_unidade(unidade_id uuid PRIMARY KEY, dias int[]);
    CREATE FUNCTION dp_folga_dias_fds_aplicaveis(uuid,uuid) RETURNS int[] LANGUAGE sql AS 'SELECT COALESCE((SELECT dias FROM dias_unidade WHERE unidade_id=$2), ARRAY[0])';
    CREATE FUNCTION dp_folgas_janela_efetiva(uuid,uuid,date) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"folgas_exigidas":1}''::jsonb';
    CREATE FUNCTION private.dp_folga_data_bloqueada_colab(uuid,date) RETURNS boolean LANGUAGE sql AS 'SELECT false';
    CREATE FUNCTION dp_folga_conflito_colaboradores(uuid,uuid,date) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{"conflito":false}''::jsonb';
    -- Limite de 1 pessoa por dia na unidade.
    CREATE FUNCTION dp_folga_limite_dia(p_company uuid,p_unidade uuid,p_cargo uuid,p_data date,p_ignorar uuid DEFAULT NULL,p_setor uuid DEFAULT NULL)
      RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('limite',1,'em_folga',(SELECT count(*) FROM dp_folgas f JOIN dp_colaboradores c ON c.id=f.colaborador_id
        WHERE c.unidade_id=p_unidade AND f.data=p_data AND f.status<>'cancelada'),'por_cargo',false) $$;
    CREATE FUNCTION dp_folga_marcadas_no_mes(_company uuid, _colab uuid, _competencia date, _dias integer[]) RETURNS integer LANGUAGE sql AS $$
      SELECT count(*)::int FROM dp_folgas f
       WHERE f.colaborador_id = _colab AND f.status <> 'cancelada' AND f.extra = false AND f.tipo NOT IN ('ferias','licenca')
         AND date_trunc('month', f.data) = date_trunc('month', _competencia)
         AND EXTRACT(DOW FROM f.data)::int = ANY (_dias) $$;
    INSERT INTO dias_unidade VALUES ('${unidadeA}', ARRAY[0,6]), ('${unidadeSabDom}', ARRAY[0,6]), ('${unidadeSoDom}', ARRAY[0]), ('${unidadeC}', ARRAY[0,6]), ('${unidadeD}', ARRAY[0,6]);
  `);
  await db.exec(readFileSync("drizzle/migrations/0236_folga_fds_ninguem_sem_folga.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0237_folga_auto_dias_trabalhados.sql", "utf8"));
  await db.exec(readFileSync(MIG_0238, "utf8"));
}, 30000);
afterAll(() => db.close());

describe("distribuição automática de folgas de fim de semana", () => {
  it("com tudo lotado, marca acima do limite começando pelos últimos dias do mês e avisa o gestor", async () => {
    const fds = fdsDoMes(2099, 2); // março/2099
    await colaborador(colega, empresaA, unidadeA, "Colega fictício", [0, 1, 2, 3, 4, 5, 6]);
    await colaborador(ana, empresaA, unidadeA, "Ana fictícia", [0, 1, 2, 3, 4, 5, 6]);
    await colaborador(bia, empresaA, unidadeA, "Bia fictícia", [0, 1, 2, 3, 4, 5, 6]);
    // O colega ocupa a única vaga de todos os fins de semana do mês.
    for (const d of fds) {
      await db.query(`INSERT INTO dp_folgas(company_id,colaborador_id,data,tipo,origem,status) VALUES($1,$2,$3,'normal','solicitacao','agendada')`, [empresaA, colega, d]);
    }

    const r = (await db.query<{ r: { geradas: number; excedidas: number } }>(
      `SELECT dp_folga_autoatribuir_competencia('${empresaA}','${unidadeA}','2099-03-01') AS r`,
    )).rows[0].r;
    expect(r.geradas).toBe(2);
    expect(r.excedidas).toBe(2);

    const ultimo = fds[fds.length - 1];
    const penultimo = fds[fds.length - 2];
    expect(await folgasDe(ana, "2099-03-01", "2099-03-31")).toEqual([ultimo]);
    expect(await folgasDe(bia, "2099-03-01", "2099-03-31")).toEqual([penultimo]);

    const avisos = (await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM dp_notificacoes WHERE company_id='${empresaA}' AND tipo='folga_acima_limite' AND para_admins`,
    )).rows[0].n;
    expect(avisos).toBe(2);
  });

  it("quem trabalha só aos sábados recebe folga quando a unidade negociou sábado e domingo", async () => {
    await colaborador(sabado, empresaB, unidadeSabDom, "Trabalha sábado", [1, 2, 3, 4, 5, 6]);
    await colaborador(soSabadoSemAcordo, empresaB, unidadeSoDom, "Sábado sem acordo", [1, 2, 3, 4, 5, 6]);

    await db.query(`SELECT dp_folga_autoatribuir_competencia('${empresaB}',NULL,'2099-04-01')`);
    const fds = fdsDoMes(2099, 3);
    const recebidas = await folgasDe(sabado, "2099-04-01", "2099-04-30");
    expect(recebidas).toHaveLength(1);
    expect(fds).toContain(recebidas[0]);
    expect(new Date(`${recebidas[0]}T12:00:00`).getDay()).toBe(6);
    // Unidade só com domingo: quem não trabalha domingo não tem folga dominical a cumprir.
    expect(await folgasDe(soSabadoSemAcordo, "2099-04-01", "2099-04-30")).toEqual([]);
  });

  it("reavalia a competência já concluída para quem entrou depois e no mês corrente só usa datas futuras", async () => {
    const hoje = hojeBrt();
    const comp = `${hoje.slice(0, 7)}-01`;
    const [ano, mes] = hoje.split("-").map(Number);
    const fim = iso(new Date(ano, mes, 0));

    await colaborador(atual1, empresaC, unidadeC, "Pessoa do mês", [0, 1, 2, 3, 4, 5, 6]);
    await db.query(`SELECT dp_folga_autoatribuir_competencia('${empresaC}','${unidadeC}',$1)`, [comp]);
    const status = (await db.query<{ status: string }>(
      `SELECT status FROM dp_folga_autoatribuicao_execucoes WHERE company_id='${empresaC}'`,
    )).rows[0].status;
    expect(status).toBe("concluida");

    // Admitida depois do fechamento: a nova execução não trava em "concluída".
    await colaborador(novata, empresaC, unidadeC, "Novata", [0, 1, 2, 3, 4, 5, 6]);
    await db.query(`SELECT dp_folga_autoatribuir_competencia('${empresaC}','${unidadeC}',$1)`, [comp]);

    const temFdsFuturo = fdsDoMes(ano, mes - 1).some((d) => d > hoje);
    for (const id of [atual1, novata]) {
      const datas = await folgasDe(id, comp, fim);
      for (const d of datas) expect(d > hoje).toBe(true);
      expect(datas).toHaveLength(temFdsFuturo ? 1 : 0);
    }

    // Quem já tem folga não recebe outra numa nova reavaliação.
    const antes = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM dp_folgas WHERE company_id='${empresaC}'`)).rows[0].n;
    await db.query(`SELECT dp_folga_autoatribuir_competencia('${empresaC}','${unidadeC}',$1)`, [comp]);
    const depois = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM dp_folgas WHERE company_id='${empresaC}'`)).rows[0].n;
    expect(depois).toBe(antes);
  });

  it("na reavaliação diária do mês corrente nunca passa do limite nem dispara aviso por pessoa", async () => {
    const hoje = hojeBrt();
    const comp = `${hoje.slice(0, 7)}-01`;
    const [ano, mes] = hoje.split("-").map(Number);
    const fim = iso(new Date(ano, mes, 0));
    await colaborador(colegaD, empresaD, unidadeD, "Colega D", [0, 1, 2, 3, 4, 5, 6]);
    await colaborador(semVaga, empresaD, unidadeD, "Sem vaga", [0, 1, 2, 3, 4, 5, 6]);
    for (const d of fdsDoMes(ano, mes - 1)) {
      await db.query(`INSERT INTO dp_folgas(company_id,colaborador_id,data,tipo,origem,status) VALUES($1,$2,$3,'normal','solicitacao','agendada')`, [empresaD, colegaD, d]);
    }
    await db.query(`SELECT set_config('dp.folga_reavaliacao_diaria','on',false)`);
    await db.query(`SELECT dp_folga_autoatribuir_competencia('${empresaD}','${unidadeD}',$1)`, [comp]);
    await db.query(`SELECT set_config('dp.folga_reavaliacao_diaria','off',false)`);
    expect(await folgasDe(semVaga, comp, fim)).toEqual([]);
    const avisos = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM dp_notificacoes WHERE company_id='${empresaD}'`)).rows[0].n;
    expect(avisos).toBe(0);
  });
});
