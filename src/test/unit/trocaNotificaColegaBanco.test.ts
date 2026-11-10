// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco isolado com pessoas fictícias: a proposta de troca avisa o colega convidado.
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const company = "40000000-0000-4000-8000-000000000001";
const solicitante = "40000000-0000-4000-8000-000000000002";
const colega = "40000000-0000-4000-8000-000000000003";
const userColega = "40000000-0000-4000-8000-000000000013";
const provisorio = "40000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE dp_notificacao_tipo AS ENUM ('troca_nova','troca_resposta_colega','troca_resposta_gestor');
    CREATE TABLE dp_colaboradores(id uuid PRIMARY KEY, user_id uuid, nome text, nome_social text, origem_cadastro text);
    CREATE TABLE dp_trocas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, solicitante_id uuid, destino_id uuid,
      data_original date, data_proposta date, status text, origem_registro text, notificar_portal boolean DEFAULT false,
      colega_resposta text, gestor_resposta text);
    CREATE TABLE dp_notificacoes(company_id uuid, user_id uuid, colaborador_id uuid, tipo dp_notificacao_tipo, titulo text,
      descricao text, ref_table text, ref_id uuid, para_admins boolean DEFAULT false);
    INSERT INTO dp_colaboradores VALUES
      ('${solicitante}', NULL, 'PESSOA FICTÍCIA UM', NULL, NULL),
      ('${colega}', '${userColega}', 'PESSOA FICTÍCIA DOIS', NULL, NULL),
      ('${provisorio}', '40000000-0000-4000-8000-000000000014', 'PESSOA PROVISÓRIA', NULL, 'preadmissao_rotina');
  `);
  await db.exec(readFileSync("drizzle/migrations/0212_troca_notifica_colega.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(`CREATE TRIGGER trg_dp_notif_troca AFTER INSERT OR UPDATE ON dp_trocas FOR EACH ROW EXECUTE FUNCTION dp_notif_troca();`);
}, 30000);
afterAll(() => db.close());

describe("proposta de troca avisa o colega", () => {
  it("gera aviso pessoal para o colega e o aviso da gestão", async () => {
    await db.exec(`INSERT INTO dp_trocas(company_id, solicitante_id, destino_id, data_original, data_proposta, status, origem_registro)
      VALUES ('${company}', '${solicitante}', '${colega}', '2099-11-12', '2099-11-11', 'pendente_colega', 'portal')`);
    const rows = (await db.query<{ user_id: string | null; para_admins: boolean; titulo: string; descricao: string }>(
      `SELECT user_id::text, para_admins, titulo, descricao FROM dp_notificacoes ORDER BY para_admins DESC`,
    )).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].para_admins).toBe(true);
    expect(rows[1].user_id).toBe(userColega);
    expect(rows[1].titulo).toBe("Proposta de troca de folga");
    expect(rows[1].descricao).toBe("Pessoa propôs uma troca: você passa a folgar em 12/11 e cede sua folga de 11/11. Abra o calendário para aceitar ou recusar.");
  });
  it("não avisa rotina provisória nem troca registrada pelo gestor", async () => {
    await db.exec(`DELETE FROM dp_notificacoes;
      INSERT INTO dp_trocas(company_id, solicitante_id, destino_id, data_original, data_proposta, status, origem_registro)
      VALUES ('${company}', '${solicitante}', '${provisorio}', '2099-11-19', '2099-11-18', 'pendente_colega', 'portal'),
             ('${company}', '${solicitante}', '${colega}', '2099-11-26', '2099-11-25', 'aprovada', 'gestor')`);
    const rows = (await db.query<{ user_id: string | null }>(`SELECT user_id::text FROM dp_notificacoes`)).rows;
    expect(rows.every((r) => r.user_id === null)).toBe(true);
  });
});
