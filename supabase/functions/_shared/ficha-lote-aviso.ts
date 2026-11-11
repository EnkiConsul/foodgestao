/** Texto do repasse do lote de fichas ao responsável, sempre em nome da Aveto 360. */
export const APP_URL = "https://aveto360.com";

export function linkLote(importacaoId: string): string {
  return `${APP_URL}/dp/colaboradores/importar-ficha?lote=${importacaoId}`;
}

function primeiro(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p || p.includes("@")) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function mensagemLoteFicha(o: { nome?: string | null; empresa: string; fichas: number; link: string }): string {
  const n = primeiro(o.nome);
  const fichas = o.fichas === 1 ? "a ficha de registro" : `as ${o.fichas} fichas de registro`;
  return `Olá${n ? `, ${n}` : ""}! Aqui é da equipe da *AVETO 360*.\n\n` +
    `Já organizamos ${fichas} da *${o.empresa}*: unidade, cargos e setores estão configurados.\n\n` +
    `Agora é só conferir os dados da sua equipe e concluir os cadastros:\n👉 ${o.link}\n\n` +
    `Qualquer dúvida, estamos por aqui!`;
}
