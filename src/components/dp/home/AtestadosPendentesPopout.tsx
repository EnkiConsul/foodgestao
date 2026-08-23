import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeartPulse, ArrowRight } from "lucide-react";
import { useDpAtestadosPendentes } from "@/hooks/useDpAtestadosPendentes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SESSION_KEY = "dp:atestados-popout-seen";

export function AtestadosPendentesPopout() {
  const { data = [], isLoading } = useDpAtestadosPendentes();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading || data.length === 0) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    setOpen(true);
  }, [isLoading, data.length]);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(false);
  };

  if (isLoading || data.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-amber-700" />
            Atestados aguardando análise
            <Badge className="bg-amber-600 text-white">{data.length}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {data.slice(0, 8).map((a: any) => (
            <div key={a.id} className="text-sm rounded-md border border-[hsl(var(--dp-border))] p-2 bg-amber-50/50">
              <p className="font-medium">{a.dp_colaboradores?.nome ?? "—"}</p>
              {a.data_alvo && (
                <p className="text-xs text-muted-foreground">
                  Data: {new Date(a.data_alvo).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          ))}
          {data.length > 8 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              e mais {data.length - 8}…
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={dismiss}>Fechar</Button>
          <Button asChild className="bg-amber-600 hover:bg-amber-700" onClick={dismiss}>
            <Link to="/dp/folgas?aba=solicitacoes&tipo=atestado">
              Analisar agora <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
