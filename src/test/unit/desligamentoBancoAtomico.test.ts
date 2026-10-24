// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
const id="00000000-0000-4000-8000-000000000001", c="00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE dp_desligamento_processos(id uuid primary key,status text,modalidade text,motivo text,company_id uuid,colaborador_id uuid,inicio_aviso date,data_efetiva date,criado_por uuid);
    CREATE TABLE dp_folgas(id uuid primary key default gen_random_uuid(),company_id uuid,colaborador_id uuid,data date,tipo text,origem text,status text,extra boolean,observacao text,criado_por uuid,direito_origem text,updated_at timestamptz);
    CREATE TABLE dp_folgas_canceladas(company_id uuid,colaborador_id uuid,folga_id uuid,data date,motivo text,origem_cancelamento text,cancelado_por uuid);
    CREATE FUNCTION dp_desligamento_registrar_aviso(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN INSERT INTO dp_desligamento_processos VALUES('${id}','aviso_em_curso','trabalhado','dispensa_sem_justa_causa','${c}','${c}','2026-10-02','2026-10-31',NULL); RETURN jsonb_build_object('id','${id}','repetido',false); END $$;
    CREATE FUNCTION dp_desligamento_transicao_nucleo(p jsonb) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
    CREATE FUNCTION dp_desligamento_termino_guard(p jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE FUNCTION dp_desligamento_limite_agenda(p uuid) RETURNS date LANGUAGE sql AS 'SELECT NULL::date';`);
  await db.exec(readFileSync("drizzle/migrations/0145_desligamento_banco_folgas_atomicas.sql","utf8"));
  await db.exec(readFileSync("drizzle/migrations/0146_desligamento_compensacao_cancelamento_seguro.sql","utf8"));
},30000);
afterAll(()=>db.close());
const payload = (datas:string[]) => JSON.stringify({ saldo_banco_minutos:840,saldo_residual_minutos:0,folgas_compensatorias:datas });
describe.sequential("Compensação oficial atômica sem dados reais",()=>{
  it("registra folgas posteriores ao último comparecimento mantendo vínculo até 31/10",async()=>{
    await db.query("select dp_desligamento_registrar_aviso($1::jsonb)",[payload(["2026-10-29","2026-10-30","2026-10-31"])]);
    expect((await db.query("select count(*)::int n from dp_folgas where status='agendada'")).rows).toEqual([{n:3}]);
    expect((await db.query("select data_efetiva::text, saldo_banco_minutos from dp_desligamento_processos")).rows).toEqual([{data_efetiva:"2026-10-31",saldo_banco_minutos:840}]);
  });
  it("reaplicar não duplica folgas",async()=>{
    await db.query("select dp_desligamento_banco_aplicar($1,$2::jsonb)",[id,payload(["2026-10-29","2026-10-30","2026-10-31"])]);
    expect((await db.query("select count(*)::int n from dp_folgas")).rows).toEqual([{n:3}]);
  });
  it("retirar folga cancela e guarda evidência, sem excluir",async()=>{
    await db.query("select dp_desligamento_banco_aplicar($1,$2::jsonb)",[id,payload(["2026-10-31"])]);
    expect((await db.query("select count(*)::int n from dp_folgas where status='cancelada'")).rows).toEqual([{n:2}]);
    expect((await db.query("select count(*)::int n from dp_folgas_canceladas")).rows).toEqual([{n:2}]);
  });
  it("não permite folga depois do término e mantém estado anterior",async()=>{
    await expect(db.query("select dp_desligamento_banco_aplicar($1,$2::jsonb)",[id,payload(["2026-11-01"])])).rejects.toThrow("Folga fora do aviso");
    expect((await db.query("select folgas_compensatorias from dp_desligamento_processos")).rows).toEqual([{folgas_compensatorias:["2026-10-31"]}]);
  });
  it("reconsiderar cancela a folga vinculada sem apagar histórico",async()=>{
    await db.exec("update dp_desligamento_processos set status='reconsiderado'");
    expect((await db.query("select count(*)::int n from dp_folgas where status='agendada'")).rows).toEqual([{n:0}]);
  });
  it("falha nas folgas desfaz também abertura do processo",async()=>{
    await db.exec("delete from dp_folgas_canceladas; update dp_folgas set desligamento_processo_id=NULL; delete from dp_folgas; delete from dp_desligamento_processos");
    await expect(db.query("select dp_desligamento_registrar_aviso($1::jsonb)",[payload(["2026-11-01"])])).rejects.toThrow("Folga fora do aviso");
    expect((await db.query("select count(*)::int n from dp_desligamento_processos")).rows).toEqual([{n:0}]);
  });
});