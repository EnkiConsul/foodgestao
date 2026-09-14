import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de regressão: botões que só mostram um ícone precisam de nome falado,
// senão quem usa leitor de tela ouve apenas "botão".
function arquivosDp(): string[] {
  return globSync("src/{pages,components}/dp/**/*.tsx").filter((p) => !p.includes(".test."));
}

function tagsDeBotao(fonte: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while (true) {
    const inicio = fonte.indexOf("<Button", i);
    if (inicio < 0) break;
    let k = inicio;
    let chaves = 0;
    while (k < fonte.length) {
      const c = fonte[k];
      if (c === "{") chaves += 1;
      else if (c === "}") chaves -= 1;
      else if (c === ">" && chaves === 0) break;
      k += 1;
    }
    tags.push(fonte.slice(inicio, k + 1));
    i = k + 1;
  }
  return tags;
}

describe("acessibilidade do módulo Pessoas", () => {
  it("todo botão só com ícone tem nome falado", () => {
    const semNome: string[] = [];
    for (const arquivo of arquivosDp()) {
      const fonte = readFileSync(arquivo, "utf8");
      for (const tag of tagsDeBotao(fonte)) {
        if (!tag.includes('size="icon"')) continue;
        if (tag.includes("aria-label")) continue;
        semNome.push(`${arquivo}: ${tag.slice(0, 80)}`);
      }
    }
    expect(semNome).toEqual([]);
  });

  it("rótulos dos formulários revisados apontam para um campo", () => {
    const revisados = [
      "src/components/dp/RemuneracaoFields.tsx",
      "src/pages/dp/DpDisciplinar.tsx",
      "src/pages/dp/DpAtestados.tsx",
      "src/components/dp/DpPessoaAvulsaDialog.tsx",
      "src/pages/dp/portal/DpMeuPerfil.tsx",
    ];
    for (const arquivo of revisados) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte.includes('htmlFor="'), arquivo).toBe(true);
    }
  });
});
