// ------------------------------------------------------------------
// Domínio: DP → Condições combinadas com o freelancer
//
// O freelancer é acerto avulso: diária, refeição, ajuda de transporte e
// gorjeta são combinados caso a caso e viajam junto com o convite, para
// que a pessoa aceite sabendo exatamente o que vai receber.
// Nada disso vale para o intermitente, que segue as verbas do vínculo.
// ------------------------------------------------------------------

export const FREELA_MARCADOR = "— Combinado com o freelancer —";

export type FreelaRefeicao = "nenhuma" | "loja" | "vale";

export interface CondicoesFreela {
  diaria: number | null;
  refeicao: FreelaRefeicao;
  refeicaoValor: number | null;
  transporteValor: number | null;
  gorjeta: boolean;
}

export const CONDICOES_FREELA_VAZIAS: CondicoesFreela = {
  diaria: null,
  refeicao: "nenhuma",
  refeicaoValor: null,
  transporteValor: null,
  gorjeta: false,
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** true quando alguma condição foi preenchida. */
export function temCondicoesFreela(c: CondicoesFreela): boolean {
  return (
    (c.diaria ?? 0) > 0 ||
    c.refeicao !== "nenhuma" ||
    (c.transporteValor ?? 0) > 0 ||
    c.gorjeta
  );
}

/** Texto legível das condições, para o convite e para a revisão. */
export function textoCondicoesFreela(c: CondicoesFreela): string {
  if (!temCondicoesFreela(c)) return "";
  const linhas: string[] = [FREELA_MARCADOR];
  if ((c.diaria ?? 0) > 0) linhas.push(`Diária: ${moeda(c.diaria!)}`);
  if (c.refeicao === "loja") linhas.push("Refeição: fornecida na loja");
  if (c.refeicao === "vale") {
    linhas.push(
      (c.refeicaoValor ?? 0) > 0
        ? `Vale-alimentação: ${moeda(c.refeicaoValor!)} por dia`
        : "Vale-alimentação: valor a combinar",
    );
  }
  if ((c.transporteValor ?? 0) > 0) linhas.push(`Ajuda de transporte: ${moeda(c.transporteValor!)} por dia`);
  if (c.gorjeta) linhas.push("Participa da gorjeta do dia");
  return linhas.join("\n");
}

/** Junta a observação livre com as condições combinadas. */
export function comporObservacaoFreela(observacao: string, c: CondicoesFreela): string {
  const termos = textoCondicoesFreela(c);
  return [observacao.trim(), termos].filter(Boolean).join("\n\n");
}

/** Remove o bloco de condições ao reabrir um rascunho (evita duplicar). */
export function separarObservacaoFreela(texto: string | null | undefined): string {
  if (!texto) return "";
  const idx = texto.indexOf(FREELA_MARCADOR);
  return (idx >= 0 ? texto.slice(0, idx) : texto).trim();
}

/** Lê de volta as condições gravadas no texto do rascunho. */
export function lerCondicoesFreela(texto: string | null | undefined): CondicoesFreela {
  if (!texto || !texto.includes(FREELA_MARCADOR)) return { ...CONDICOES_FREELA_VAZIAS };
  const bloco = texto.slice(texto.indexOf(FREELA_MARCADOR));
  const valor = (re: RegExp) => {
    const m = bloco.match(re);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return {
    diaria: valor(/Diária:\s*R\$\s*([\d.,]+)/),
    refeicao: /Refeição: fornecida na loja/.test(bloco)
      ? "loja"
      : /Vale-alimentação:/.test(bloco)
        ? "vale"
        : "nenhuma",
    refeicaoValor: valor(/Vale-alimentação:\s*R\$\s*([\d.,]+)/),
    transporteValor: valor(/Ajuda de transporte:\s*R\$\s*([\d.,]+)/),
    gorjeta: /Participa da gorjeta/.test(bloco),
  };
}
