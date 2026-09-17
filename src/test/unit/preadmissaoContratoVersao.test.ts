/**
 * Contrato da chamada real de gravação da pré-admissão.
 *
 * O navegador manda a versão que acompanhou os dados; a rotina pública precisa
 * repassá-la para o banco como versão esperada, para que uma gravação em cima
 * de ficha já alterada seja recusada com aviso — nunca aceita em silêncio.
 */
import { describe, expect, it } from "vitest";
import { salvarCandidato, avaliarDocumento, MOTIVOS_GRAVACAO } from "../../../supabase/functions/_shared/preadmissao.ts";

type Chamada = { nome: string; args: Record<string, unknown> };

function rpcFalso(resposta: unknown) {
  const chamadas: Chamada[] = [];
  const admin = {
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return Promise.resolve({ data: resposta, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, chamadas };
}

const base = {
  preadmissaoId: "11111111-1111-1111-1111-111111111111",
  estados: ["em_preenchimento"] as const,
  statusNovo: null,
  dados: { nome: "CANDIDATO TESTE" },
  campos: {},
  pessoas: null,
};

describe("contrato de versão na gravação da pré-admissão", () => {
  it("repassa ao banco a versão que veio do navegador", async () => {
    const { admin, chamadas } = rpcFalso({ ok: true, versao: 8 });
    const r = await salvarCandidato(admin, { ...base, versaoEsperada: 7 });
    expect(r.ok).toBe(true);
    expect(chamadas[0].nome).toBe("dp_preadmissao_salvar_candidato");
    expect(chamadas[0].args.p_versao_esperada).toBe(7);
  });

  it("sem versão informada manda nulo em vez de inventar um número", async () => {
    const { admin, chamadas } = rpcFalso({ ok: true, versao: 2 });
    await salvarCandidato(admin, base);
    expect(chamadas[0].args.p_versao_esperada).toBeNull();
  });

  it("versão desatualizada volta como recusa com aviso pronto para a tela", async () => {
    const { admin } = rpcFalso({ ok: false, motivo: "versao_alterada", versao: 9 });
    const r = await salvarCandidato(admin, { ...base, versaoEsperada: 7 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("versao_alterada");
    expect(MOTIVOS_GRAVACAO.versao_alterada).toBeTruthy();
  });

  it("análise de documento usa a rotina única (avaliação e versão juntas)", async () => {
    const { admin, chamadas } = rpcFalso({ ok: true, versao: 5, requisito_codigo: "rg_cpf" });
    const r = await avaliarDocumento(
      admin,
      base.preadmissaoId,
      "22222222-2222-2222-2222-222222222222",
      "recusado",
      "Foto ilegivel",
    );
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].nome).toBe("dp_preadmissao_avaliar_documento");
    expect(chamadas[0].args.p_status).toBe("recusado");
    expect(chamadas[0].args.p_motivo).toBe("Foto ilegivel");
  });
});
