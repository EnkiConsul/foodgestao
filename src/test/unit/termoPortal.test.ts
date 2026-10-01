import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  TERMO_PORTAL_PARAGRAFOS,
  TERMO_PORTAL_TITULO,
  TERMO_PORTAL_VERSAO,
  termoPortalConteudo,
} from "@/lib/dp/termoPortal";

const ARQ_SERVIDOR = "supabase/functions/_shared/termo-portal.ts";

describe("termo de primeiro acesso ao portal", () => {
  it("o texto canônico começa pelo título com a versão", () => {
    const conteudo = termoPortalConteudo();
    expect(conteudo.startsWith(`${TERMO_PORTAL_TITULO} (${TERMO_PORTAL_VERSAO})`)).toBe(true);
    expect(conteudo).toContain(TERMO_PORTAL_PARAGRAFOS[0]);
    expect(conteudo).toContain(TERMO_PORTAL_PARAGRAFOS[TERMO_PORTAL_PARAGRAFOS.length - 1]);
  });

  it("o termo cobre os pontos que dão lastro à assinatura eletrônica", () => {
    const conteudo = termoPortalConteudo();
    for (const marca of ["2.200-2", "14.063", "13.709", "assinar eletronicamente"]) {
      expect(conteudo).toContain(marca);
    }
  });

  it("a cópia do servidor é idêntica à da tela", () => {
    const src = readFileSync(ARQ_SERVIDOR, "utf8");
    expect(src).toContain(`export const TERMO_PORTAL_VERSAO = "${TERMO_PORTAL_VERSAO}";`);
    expect(src).toContain(`export const TERMO_PORTAL_TITULO = "${TERMO_PORTAL_TITULO}";`);
    for (const p of TERMO_PORTAL_PARAGRAFOS) {
      expect(src).toContain(p);
    }
    // Mesma quantidade de parágrafos: nenhuma cópia pode ter item sobrando.
    const itens = src.match(/^ {2}"/gm)?.length ?? 0;
    expect(itens).toBe(TERMO_PORTAL_PARAGRAFOS.length);
  });

  it("a tela de ativação exige o aceite e o servidor registra o termo", () => {
    expect(readFileSync("src/pages/AtivarAcesso.tsx", "utf8")).toContain("TERMO_PORTAL_VERSAO");
    const fn = readFileSync("supabase/functions/dp-alterar-senha-colaborador/index.ts", "utf8");
    expect(fn).toContain('from "../_shared/termo-portal.ts"');
    expect(fn).toContain("dp_documento_aceites");
  });
});
