import { describe, it, expect } from "vitest";
import { selecionarPendentesAssinatura } from "../useDocumentosAguardandoAssinatura";

const base = {
  tipo: "contracheque",
  referencia_data: "2026-05-01",
  file_path: "p.pdf",
  file_name: "p.pdf",
  mime_type: "application/pdf",
  aprovacao_status: "aprovado",
  submetido_por_colaborador: false,
  exige_aceite: true,
};

describe("selecionarPendentesAssinatura", () => {
  it("mostra o mais antigo primeiro", () => {
    const r = selecionarPendentesAssinatura(
      [
        { ...base, id: "b", created_at: "2026-06-01T10:00:00Z" },
        { ...base, id: "a", created_at: "2026-05-01T10:00:00Z" },
      ],
      [],
    );
    expect(r.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("ignora documentos já assinados", () => {
    const r = selecionarPendentesAssinatura(
      [{ ...base, id: "a", created_at: "2026-05-01T10:00:00Z" }],
      [{ documento_id: "a" }],
    );
    expect(r).toHaveLength(0);
  });

  it("ignora envios do colaborador, não aprovados e sem exigência de aceite", () => {
    const r = selecionarPendentesAssinatura(
      [
        { ...base, id: "a", created_at: "2026-05-01T10:00:00Z", submetido_por_colaborador: true },
        { ...base, id: "b", created_at: "2026-05-01T10:00:00Z", aprovacao_status: "pendente" },
        { ...base, id: "c", created_at: "2026-05-01T10:00:00Z", exige_aceite: false },
      ],
      [],
    );
    expect(r).toHaveLength(0);
  });

  it("monta rótulo de tipo e competência", () => {
    const [d] = selecionarPendentesAssinatura(
      [{ ...base, id: "a", created_at: "2026-05-01T10:00:00Z", titulo: null }],
      [],
    );
    expect(d.tipo_label).toBe("Contracheque");
    expect(d.competencia_label).toBe("05/2026");
  });
});

describe("documento excluído pelo DP", () => {
  it("documento arquivado nunca aparece para assinar", async () => {
    const { selecionarPendentesAssinatura } = await import("../useDocumentosAguardandoAssinatura");
    const base = { exige_aceite: true, tipo: "adiantamento", aprovacao_status: "aprovado", created_at: "2026-10-01" };
    const r = selecionarPendentesAssinatura(
      [
        { ...base, id: "a", arquivado_em: "2026-10-14", ciclo_status: "arquivado" },
        { ...base, id: "b", arquivado_em: null, ciclo_status: "ativo" },
      ],
      [],
    );
    expect(r.map((d) => d.id)).toEqual(["b"]);
  });
});
