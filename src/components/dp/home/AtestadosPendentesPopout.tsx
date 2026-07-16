import { Link } from "react-router-dom";
import { HeartPulse, ArrowRight } from "lucide-react";
import { useDpAtestadosPendentes } from "@/hooks/useDpAtestadosPendentes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AtestadosPendentesPopout() {
  const { data = [], isLoading } = useDpAtestadosPendentes();
  if (isLoading || data.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
        <HeartPulse className="h-5 w-5 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-amber-900">Atestados aguardando análise</p>
          <Badge className="bg-amber-600 text-white">{data.length}</Badge>
        </div>
        <p className="text-xs text-amber-800/80">
          {data.slice(0, 3).map((a) => a.dp_colaboradores?.nome ?? "—").join(", ")}
          {data.length > 3 && ` +${data.length - 3}`}
        </p>
      </div>
      <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
        <Link to="/dp/solicitacoes?tipo=atestado">
          Analisar <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </Button>
    </div>
  );
}
