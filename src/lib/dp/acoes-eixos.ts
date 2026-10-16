/**
 * Agrupamento das "Ações do Dia" por assunto de negócio.
 * Atrasadas e urgentes sempre caem em "Críticas"; o resto vai para o assunto do tipo.
 */
import { urgenciaDe, type PendenciaLike } from "@/lib/dp/pendencias";

export type EixoAcao = "criticas" | "equipe" | "documentos" | "cadastros";

export const EIXOS: { value: EixoAcao; label: string; curto: string; descricao: string }[] = [
  { value: "criticas", label: "Críticas e prazos legais", curto: "Críticas", descricao: "Atrasadas, urgentes e prazos com risco de multa." },
  { value: "equipe", label: "Equipe e escala", curto: "Equipe", descricao: "Escala, convocações, trocas, licenças e ocorrências." },
  { value: "documentos", label: "Documentos e contabilidade", curto: "Documentos", descricao: "Assinaturas, comprovantes e papéis do mês." },
  { value: "cadastros", label: "Cadastros e ajustes", curto: "Cadastros", descricao: "Dados que faltam completar, sem travar o dia." },
];

const LEGAIS = new Set(["Férias", "Rescisão", "Conformidade"]);
const EQUIPE = new Set(["Escala", "Intermitente", "Troca", "Solicitação", "Ocorrência", "Licença", "Negociação", "Feriados"]);
const CADASTROS = new Set(["Cadastro de Colaborador", "Dependente", "Benefícios", "Pré-Admissão", "Regras", "Salário-família"]);

export function eixoDe(p: Pick<PendenciaLike, "tipo" | "atrasoDias" | "urgente">): EixoAcao {
  const u = urgenciaDe(p);
  if (u === "atrasada" || u === "urgente" || LEGAIS.has(p.tipo)) return "criticas";
  if (EQUIPE.has(p.tipo)) return "equipe";
  if (CADASTROS.has(p.tipo)) return "cadastros";
  return "documentos";
}
