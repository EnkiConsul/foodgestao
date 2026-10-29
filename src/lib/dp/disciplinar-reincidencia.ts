import { subMonths } from "date-fns";

export type AntecedenteDisciplinar = {
  id: string; colaborador_id: string; tipo: string; data: string; motivo: string;
  removido_em?: string | null; via_assinada_path?: string | null;
};
export const TIPOS_DISCIPLINARES = ["advertencia_verbal", "advertencia_escrita", "suspensao"];
export const MOTIVOS_DISCIPLINARES = [
  { label: "Atraso ou Falta Injustificada", alinea: "e" },
  { label: "Insubordinação / Descumprimento de Ordem", alinea: "h" },
  { label: "Indisciplina / Descumprimento de Normas Internas", alinea: "h" },
  { label: "Mau Procedimento / Conduta Inadequada", alinea: "b" },
  { label: "Desídia no Desempenho das Funções", alinea: "e" },
  { label: "Ofensa ou Agressão a Colega ou Cliente", alinea: "j" },
  { label: "Uso Indevido de Celular no Expediente", alinea: "h" },
  { label: "Embriaguez em Serviço", alinea: "f" },
];
export function antecedentesElegiveis(rows: AntecedenteDisciplinar[], colaboradorId: string, admissao: string | null | undefined, data: string, excluirId?: string) {
  if (!admissao || !data) return [];
  return rows.filter(r => r.colaborador_id === colaboradorId && r.id !== excluirId && !r.removido_em &&
    TIPOS_DISCIPLINARES.includes(r.tipo) && r.data >= admissao.slice(0, 10) && r.data < data &&
    (r.tipo === "advertencia_verbal" || !!r.via_assinada_path))
    .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
}
export function antecedenteRecente(data: string, referencia: string) {
  return data >= subMonths(new Date(`${referencia}T12:00:00`), 6).toISOString().slice(0, 10);
}
export function textoAntecedentes(rows: AntecedenteDisciplinar[]) {
  const nomes: Record<string, string> = { advertencia_verbal: "orientação e advertência verbal", advertencia_escrita: "advertência escrita", suspensao: "suspensão disciplinar" };
  return [...rows].sort((a,b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)).map(r => {
    const [a,m,d] = r.data.slice(0,10).split("-");
    return `Consta no histórico do contrato atual ${nomes[r.tipo]} em ${d}/${m}/${a}, pelo motivo: ${r.motivo}.`;
  }).join("\n");
}