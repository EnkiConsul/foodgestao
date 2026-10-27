import { aniversarioNoPeriodo } from "./aniversarios-calendario";

export type VinculoAniversario = {
  regime?: string | null;
  vinculo_label?: string | null;
  origem_cadastro?: string | null;
  data_admissao?: string | null;
  data_base_contagem?: string | null;
};

export function elegivelAniversarioContratacao(c: VinculoAniversario): boolean {
  if (c.origem_cadastro === "preadmissao_rotina") return false;
  const label = c.vinculo_label?.trim().toLowerCase();
  if (label === "socio" || label === "sócio") return true;
  return ["clt", "intermitente", "estagio", "temporario"].includes(c.regime ?? "");
}

/** Nunca usa uma base anterior à admissão do vínculo atual (recontratação). */
export function dataInicioVinculoAtual(c: VinculoAniversario): string | null {
  const admissao = c.data_admissao?.slice(0, 10);
  if (!admissao || !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) return null;
  const base = c.data_base_contagem?.slice(0, 10);
  return base && /^\d{4}-\d{2}-\d{2}$/.test(base) && base > admissao ? base : admissao;
}

export function aniversarioContratacao(c: VinculoAniversario, competencia?: string, hoje = new Date()) {
  if (!elegivelAniversarioContratacao(c)) return null;
  const base = dataInicioVinculoAtual(c);
  const aniversario = base ? aniversarioNoPeriodo(base, competencia, hoje) : null;
  return aniversario && aniversario.anosCompletos >= 1 ? aniversario : null;
}