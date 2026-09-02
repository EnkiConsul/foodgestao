/**
 * Helpers puros extraídos de `TransactionFormDialog.tsx` para reduzir o
 * tamanho do componente sem alterar comportamento. Cobre:
 * - Manipulação de datas locais (parse/format ISO curto, weekday, month-day)
 * - Construção da árvore de categorias e opções planas para SearchableSelect
 * - Geração de datas de recorrência e preview de ocorrências
 *
 * A regra de "próxima ocorrência" é reexportada de `installments.ts`
 * para manter uma única fonte de verdade.
 */

import { addYears } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { getNextRecurrenceDate } from "@/lib/transactions/installments";

export { getNextRecurrenceDate };

export type CategoryNode = Tables<"categories"> & { children: CategoryNode[]; depth: number };

export function buildCategoryTree(cats: Tables<"categories">[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  const orphans: CategoryNode[] = [];
  cats.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  cats.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else if (c.parent_id) {
      // Pai ausente da lista (legado): mantém recuo visual e vai para o fim.
      node.depth = 1;
      orphans.push(node);
    } else {
      roots.push(node);
    }
  });
  // Profundidade calculada na varredura raiz → filhos, imune à ordem de entrada.
  const setDepth = (list: CategoryNode[], depth: number) => {
    list.forEach((n) => {
      n.depth = depth;
      if (n.children.length) setDepth(n.children, depth + 1);
    });
  };
  setDepth(roots, 0);
  return [...roots, ...orphans];
}

export function flattenCategoryTree(nodes: CategoryNode[]): SearchableSelectOption[] {
  const out: SearchableSelectOption[] = [];
  const walk = (list: CategoryNode[]) => {
    list.forEach((n) => {
      out.push({ value: n.id, label: n.name, depth: n.depth });
      if (n.children.length) walk(n.children);
    });
  };
  walk(nodes);
  return out;
}

export function generateRecurrenceDates(startDate: string, recType: string, endDate?: string): string[] {
  const dates: string[] = [];
  const maxOccurrences = 365;
  const horizon = endDate ? new Date(endDate) : addYears(new Date(startDate), 1);
  let current = new Date(startDate);
  for (let i = 0; i < maxOccurrences; i++) {
    current = getNextRecurrenceDate(current, recType);
    if (current > horizon) break;
    dates.push(current.toISOString().split("T")[0]);
  }
  return dates;
}

export const WEEKDAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftToWeekday(dateStr: string, weekday: number): string {
  if (!dateStr) return dateStr;
  const d = parseLocalDate(dateStr);
  const target = ((weekday % 7) + 7) % 7;
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
}

export function currentWeekday(dateStr: string, fallback = 1): number {
  if (!dateStr) return fallback;
  const d = parseLocalDate(dateStr);
  return isNaN(d.getTime()) ? fallback : d.getDay();
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function shiftToMonthDay(dateStr: string, dayOfMonth: number): string {
  if (!dateStr) return dateStr;
  const d = parseLocalDate(dateStr);
  const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
  const target = Math.max(1, Math.min(31, dayOfMonth));
  d.setDate(Math.min(target, last));
  return toLocalDateStr(d);
}

export function currentMonthDay(dateStr: string, fallback = 1): number {
  if (!dateStr) return fallback;
  const d = parseLocalDate(dateStr);
  return isNaN(d.getTime()) ? fallback : d.getDate();
}

export const MONTH_DAYS: { value: string; label: string }[] = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: `Dia ${i + 1}`,
}));

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatBR(dateStr: string): string {
  if (!dateStr) return "—";
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} (${WEEKDAY_SHORT[d.getDay()]})`;
}

export function buildOccurrencePreview(
  baseDate: string,
  dueDateStr: string,
  period: string,
  count: number,
  endDate?: string,
): { date: string; due: string | null }[] {
  if (!baseDate) return [];
  const results: { date: string; due: string | null }[] = [];
  const diffMs = dueDateStr ? parseLocalDate(dueDateStr).getTime() - parseLocalDate(baseDate).getTime() : 0;
  const horizon = endDate ? parseLocalDate(endDate) : null;
  let cursor = parseLocalDate(baseDate);
  for (let i = 0; i < count; i++) {
    if (horizon && cursor > horizon) break;
    const dStr = toLocalDateStr(cursor);
    const dueStr = dueDateStr
      ? toLocalDateStr(new Date(cursor.getTime() + diffMs))
      : null;
    results.push({ date: dStr, due: dueStr });
    cursor = getNextRecurrenceDate(cursor, period);
  }
  return results;
}
