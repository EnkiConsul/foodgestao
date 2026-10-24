import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { etapaDaPreadmissao, type AdmissaoReferencia } from "@/lib/dp/admissao-apresentacao";
import { rotuloRegime } from "@/lib/dp/regimesAdmissao";

export function AdmissaoResumo({ ficha, onAbrir }: { ficha: AdmissaoReferencia; onAbrir: () => void }) {
  const data = ficha.admin_dados?.data_admissao;
  return <div className="mt-2 min-w-0 space-y-1 text-left">
    <Badge variant="outline" className="whitespace-normal border-warning/40 bg-warning/10 text-warning-foreground">Aguardando admissão</Badge>
    <p className="break-words text-xs text-foreground">{etapaDaPreadmissao(ficha)}</p>
    <p className="break-words text-xs text-muted-foreground">Vínculo previsto: {rotuloRegime(String(ficha.admin_dados?.regime_trabalho || ficha.regime_previsto || "clt"))}
      {typeof data === "string" && data && <> · Admissão prevista: {data.split("-").reverse().join("/")}</>}
    </p>
    <Button variant="link" size="sm" className="h-auto min-h-8 whitespace-normal px-0 text-xs" onClick={(e) => { e.stopPropagation(); onAbrir(); }}>Rever processo de admissão →</Button>
  </div>;
}