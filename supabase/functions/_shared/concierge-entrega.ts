export type ModoTrial = "manter" | "reiniciar_7d" | "somar_7d";
export type EntregaApoio = {
  modo_trial: ModoTrial;
  prazos: { modulo: string; fim: string | null; fim_atual?: string | null }[];
  unidades: number;
  fichas: number;
};

export function prazoConcierge(fim: string | null, modo: ModoTrial, agora: Date): string | null {
  if (modo === "manter") return fim;
  const base = modo === "somar_7d" ? Math.max(agora.getTime(), fim ? new Date(fim).getTime() : 0) : agora.getTime();
  return new Date(base + 7 * 86400000).toISOString();
}

export function mensagemApoio(o: { nome: string; empresa: string; temPessoas: boolean; entrega: EntregaApoio; agora?: Date }) {
  const nome = o.nome.trim().split(/\s+/)[0] ?? "";
  const agora = o.agora ?? new Date();
  const prazos = o.entrega.prazos.map((p) => {
    const modulo = p.modulo === "dp" || p.modulo === "pessoas" ? "Pessoas 360°" : "Financeiro 360°";
    if (!p.fim) return `${modulo}: sem teste grátis vigente.`;
    const data = new Date(p.fim).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    if (new Date(p.fim) <= agora) return `${modulo}: teste encerrado em ${data}.`;
    const acao = o.entrega.modo_trial === "manter" ? "prazo mantido" : "teste renovado";
    return `${modulo}: ${acao} até ${data}.`;
  });
  const equipe = o.temPessoas
    ? `${o.entrega.unidades} loja(s) configurada(s). ${o.entrega.fichas} importação(ões) de fichas disponível(is) para conferência.\n\n`
    : "";
  const link = o.temPessoas ? "/dp/colaboradores/importar-ficha" : "/index";
  return `Olá${nome ? `, ${nome}` : ""}! Aqui é da equipe da AVETO 360.\n\nFinalizamos a parametrização da ${o.empresa}.\n\n${equipe}${prazos.join("\n") || "Os prazos de acesso foram mantidos."}\n\nAcesse com seu login e senha de sempre:\nhttps://aveto360.com${link}\n\n${o.temPessoas ? "Confira as fichas e finalize as admissões pelo fluxo habitual. " : ""}Se precisar de apoio, estamos por aqui!`;
}