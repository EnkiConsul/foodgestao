/**
 * Apresentação da "Rotina da loja" no calendário do colaborador.
 * Funções puras: só reorganizam o que o servidor já devolveu, nunca inventam escala.
 */

export const SEM_TURNO = "sem-turno";

export type PessoaRotina = {
  id: string;
  nome: string;
  cargo: string;
  setor: string | null;
  entrada: string | null;
  saida: string | null;
  origem: string | null;
  turnoChave: string;
  turnoNome: string | null;
};

export type TurnoRotina = { chave: string; nome: string; entrada: string | null; pessoas: PessoaRotina[] };

const horario = (p: Pick<PessoaRotina, "entrada" | "saida">) =>
  p.entrada && p.saida ? `${p.entrada}-${p.saida}` : null;

/**
 * Agrupa por turno. Quem tem horário mas não tem turno cadastrado entra no turno
 * nomeado que tem exatamente o mesmo horário (ex.: "Jantar 17:00–00:35"), em vez
 * de virar um card isolado. Se houver dois turnos com o mesmo horário, fica no próprio card.
 */
export function agruparTurnosRotina(lista: PessoaRotina[]): TurnoRotina[] {
  const m = new Map<string, TurnoRotina>();
  const semTurno: PessoaRotina[] = [];
  for (const p of lista) {
    if (!p.turnoNome && p.turnoChave.startsWith("h:")) { semTurno.push(p); continue; }
    const atual = m.get(p.turnoChave);
    if (atual) { atual.pessoas.push(p); continue; }
    const h = p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : null;
    const nome = p.turnoNome ? (h ? `${p.turnoNome} · ${h}` : p.turnoNome) : (h ?? "Horário a confirmar");
    m.set(p.turnoChave, { chave: p.turnoChave, nome, entrada: p.entrada, pessoas: [p] });
  }
  for (const p of semTurno) {
    const hp = horario(p);
    const candidatos = Array.from(m.values()).filter(
      (t) => t.chave !== SEM_TURNO && !t.chave.startsWith("h:") && t.pessoas.some((o) => horario(o) === hp),
    );
    if (hp && candidatos.length === 1) { candidatos[0].pessoas.push(p); continue; }
    const atual = m.get(p.turnoChave);
    if (atual) { atual.pessoas.push(p); continue; }
    m.set(p.turnoChave, {
      chave: p.turnoChave,
      nome: p.entrada && p.saida ? `${p.entrada} às ${p.saida}` : "Horário a confirmar",
      entrada: p.entrada,
      pessoas: [p],
    });
  }
  for (const t of m.values()) t.pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return Array.from(m.values()).sort((a, b) => (a.entrada ?? "99:99").localeCompare(b.entrada ?? "99:99"));
}

export type ForaRotina = { id: string; nome: string; cargo: string; situacao: string };

/**
 * Colegas que o calendário já mostra de folga no dia (ex.: folga semanal fixa)
 * entram em "Fora da operação" mesmo se o servidor não os listou — assim o botão
 * "Trocar" nunca some. Quem aparece trabalhando no dia nunca é acrescentado.
 */
export function completarForaDaOperacao(
  fora: ForaRotina[],
  trabalhando: { id: string }[],
  colegasDeFolga: { id: string; nome: string }[],
): ForaRotina[] {
  const ja = new Set([...fora.map((f) => f.id), ...trabalhando.map((p) => p.id)]);
  const extra = colegasDeFolga
    .filter((c) => !ja.has(c.id) && (ja.add(c.id), true))
    .map((c) => ({ id: c.id, nome: c.nome, cargo: "", situacao: "folga" }));
  return extra.length ? [...fora, ...extra].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : fora;
}
