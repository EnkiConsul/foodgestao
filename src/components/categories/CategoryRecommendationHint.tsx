import { Sparkles, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CategoryRecommendation } from "@/lib/categories/recommend";

type Props = {
  recommendations: CategoryRecommendation[];
  selectedCategoryId?: string | null;
  onApply: (categoryId: string) => void;
};

/**
 * Lista compacta de categorias recomendadas para o lançamento, com a
 * justificativa (palavras-chave e exemplos que casaram com a descrição).
 */
export function CategoryRecommendationHint({
  recommendations,
  selectedCategoryId,
  onApply,
}: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-2.5 space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Categorias recomendadas
      </p>
      <div className="space-y-1.5">
        {recommendations.map((rec) => {
          const isSelected = selectedCategoryId === rec.categoryId;
          return (
            <button
              key={rec.categoryId}
              type="button"
              onClick={() => onApply(rec.categoryId)}
              className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 text-xs font-medium">{rec.categoryName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(rec.confidence * 100)}%
                </span>
                {isSelected ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                    Aplicar
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                {rec.reason}
              </span>
              {(rec.matchedKeywords.length > 0 || rec.matchedExamples.length > 0) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {rec.matchedKeywords.map((k) => (
                    <Badge
                      key={`kw-${k}`}
                      variant="secondary"
                      className="px-1.5 py-0 text-[10px] font-normal"
                    >
                      {k}
                    </Badge>
                  ))}
                  {rec.matchedExamples.map((e) => (
                    <Badge
                      key={`ex-${e}`}
                      variant="outline"
                      className="px-1.5 py-0 text-[10px] font-normal"
                    >
                      {e}
                    </Badge>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
