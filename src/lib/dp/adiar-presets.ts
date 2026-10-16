/** Atalhos de adiamento das Ações do Dia: datas em vez de "N dias". */
import { addDays, format } from "date-fns";

export type AdiarPreset = { chave: string; label: string; data: string };

export function adiarPresets(hoje: Date = new Date()): AdiarPreset[] {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dow = base.getDay(); // 0 = domingo
  const ateSegunda = ((8 - dow) % 7) || 7;
  const fimMes = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const lista: AdiarPreset[] = [
    { chave: "amanha", label: "Amanhã", data: fmt(addDays(base, 1)) },
    { chave: "segunda", label: "Próxima segunda", data: fmt(addDays(base, ateSegunda)) },
    { chave: "fim_mes", label: "Fim do mês", data: fmt(fimMes <= base ? addDays(base, 1) : fimMes) },
    { chave: "15d", label: "Em 15 dias", data: fmt(addDays(base, 15)) },
  ];
  // Evita dois atalhos com a mesma data (ex.: domingo → amanhã = segunda).
  const vistas = new Set<string>();
  return lista.filter((p) => (vistas.has(p.data) ? false : (vistas.add(p.data), true)));
}
