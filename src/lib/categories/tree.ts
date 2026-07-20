import type { Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;

export type TreeNode = Category & { depth: number; hasChildren: boolean; index: string };

export const BATCH_COLOR_OPTIONS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

export function buildCategoryTree(categories: Category[]): TreeNode[] {
  const map = new Map<string, Category[]>();
  const roots: Category[] = [];
  const childSet = new Set<string>();

  for (const cat of categories) {
    if (cat.parent_id) {
      const children = map.get(cat.parent_id) || [];
      children.push(cat);
      map.set(cat.parent_id, children);
      childSet.add(cat.parent_id);
    } else {
      roots.push(cat);
    }
  }

  const result: TreeNode[] = [];
  function walk(items: Category[], depth: number, parentIndex: string) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = parentIndex ? `${parentIndex}.${i + 1}` : `${i + 1}`;
      result.push({ ...item, depth, hasChildren: childSet.has(item.id), index: idx });
      const children = map.get(item.id);
      if (children) walk(children, depth + 1, idx);
    }
  }
  walk(roots, 0, "");
  return result;
}
