import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { categoryTypeClass, categoryTypeLabel } from "@/lib/categories/display";

interface Props {
  type: string;
  className?: string;
}

/** Badge padrão de tipo de categoria (Receita/Despesa) usado em todas as telas. */
export function CategoryTypeBadge({ type, className }: Props) {
  return (
    <Badge
      variant="secondary"
      className={cn("text-[10px] h-5 px-1.5 font-medium", categoryTypeClass(type), className)}
    >
      {categoryTypeLabel(type)}
    </Badge>
  );
}
