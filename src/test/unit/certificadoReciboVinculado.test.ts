import { describe, expect, it } from "vitest";
import {
  estadoRecibo,
  recibosVinculados,
  sufixoCacheRecibos,
} from "../../../supabase/functions/dp-documento-certificado/recibo-vinculado";

describe("recibos vinculados à quitação", () => {
  it("inclui o recibo em dinheiro do pagamento misto", () => {
    expect(recibosVinculados({ comprovante_recibo_documento_id: "699021a0" })).toEqual([
      { id: "699021a0", origem: "especie" },
    ]);
  });

  it("inclui o recibo da diferença sem repetir o mesmo recibo", () => {
    expect(recibosVinculados({ comprovante_recibo_documento_id: "a", recibo_diferenca_documento_id: "b" })).toEqual([
      { id: "a", origem: "especie" },
      { id: "b", origem: "diferenca" },
    ]);
    expect(recibosVinculados({ comprovante_recibo_documento_id: "a", recibo_diferenca_documento_id: "a" })).toHaveLength(1);
  });

  it("sem recibo vinculado não acrescenta nada", () => {
    expect(recibosVinculados({})).toEqual([]);
  });
});

describe("situação do recibo no certificado", () => {
  const aceite = {
    conteudo_hash: "h1",
    hash_origem: "sha256_conteudo",
    assinatura_imagem: "data:image/png;base64,xx",
    documento_versao: 1,
  };

  it("assinado no portal com o conteúdo aprovado recebe a assinatura estampada", () => {
    expect(estadoRecibo({ aceite, versaoAtual: 1, hashArquivo: "h1" })).toBe("assinado_eletronico");
  });

  it("arquivo diferente do aprovado não recebe assinatura estampada", () => {
    expect(estadoRecibo({ aceite, versaoAtual: 1, hashArquivo: "outro" })).toBe("aceite_sem_conferencia");
    expect(estadoRecibo({ aceite, versaoAtual: 2, hashArquivo: "h1" })).toBe("aceite_sem_conferencia");
    expect(estadoRecibo({ aceite: { ...aceite, hash_origem: "legado_caminho" }, versaoAtual: 1, hashArquivo: "h1" }))
      .toBe("aceite_sem_conferencia");
  });

  it("via física sem aceite eletrônico usa a via assinada à mão", () => {
    expect(estadoRecibo({ aceite: null, viaAssinadaPath: "x/via.jpg" })).toBe("via_fisica");
  });

  it("recibo sem assinatura aparece como aguardando", () => {
    expect(estadoRecibo({ aceite: null })).toBe("aguardando");
  });
});

describe("certificado guardado", () => {
  it("é refeito quando o colaborador assina o recibo", () => {
    const antes = sufixoCacheRecibos([{ id: "699021a0-fd3e", aceiteId: null, versao: 1 }]);
    const depois = sufixoCacheRecibos([{ id: "699021a0-fd3e", aceiteId: "4a312b1a-0b86", versao: 1 }]);
    expect(antes).not.toBe(depois);
  });

  it("é refeito quando chega a via física", () => {
    const antes = sufixoCacheRecibos([{ id: "r1", versao: 1 }]);
    const depois = sufixoCacheRecibos([{ id: "r1", viaAssinadaPath: "p", versao: 1 }]);
    expect(antes).not.toBe(depois);
  });

  it("sem recibo mantém uma chave estável", () => {
    expect(sufixoCacheRecibos([])).toBe("sem-recibo");
  });
});
