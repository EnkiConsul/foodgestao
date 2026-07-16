import { useLocation } from "react-router-dom";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { getFavoritablePage } from "@/components/dp/favoritablePages";
import { cn } from "@/lib/utils";

export function FavoriteToggle() {
  const { pathname } = useLocation();
  const { isFavoritePage, toggleFavoritePage, saving } = useDpUserPrefs();

  const page = getFavoritablePage(pathname);
  if (!page) return null;

  const active = isFavoritePage(page.route);

  const handle = () => {
    toggleFavoritePage(page.route);
    toast.success(active ? "Removida dos favoritos" : "Adicionada aos favoritos", {
      description: page.label,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={active ? "Remover dos favoritos" : "Favoritar página"}
          aria-pressed={active}
          disabled={saving}
          onClick={handle}
          className="h-9 w-9"
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              active ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary",
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{active ? "Remover dos favoritos" : "Favoritar página"}</TooltipContent>
    </Tooltip>
  );
}
