import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

type Faixa = { ate: number; pct: number };
type Taxas = { faixas: Faixa[]; fixo_cents: number };
const CHAVE = "billing_v2_cartao_taxas";

/** Taxas do cartão repassadas no anual parcelado (2x a 12x). Só super admin grava. */
export function TaxasCartaoParametroCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["system-param", CHAVE],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("system_parameters").select("value, updated_at").eq("key", CHAVE).maybeSingle();
      if (error) throw error;
      return data as { value: Taxas; updated_at: string } | null;
    },
  });
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [fixo, setFixo] = useState("");

  useEffect(() => {
    if (!data?.value) return;
    setFaixas(data.value.faixas ?? []);
    setFixo(((data.value.fixo_cents ?? 0) / 100).toFixed(2).replace(".", ","));
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const fixoCents = Math.round(Number(fixo.replace(",", ".")) * 100);
      if (!Number.isFinite(fixoCents) || fixoCents < 0 || fixoCents > 1000) throw new Error("Valor fixo deve ficar entre R$ 0,00 e R$ 10,00.");
      const ordenadas = [...faixas].sort((a, b) => a.ate - b.ate);
      if (!ordenadas.length || ordenadas[ordenadas.length - 1].ate !== 12) throw new Error("A última faixa precisa ir até 12x.");
      for (const f of ordenadas) {
        if (!Number.isInteger(f.ate) || f.ate < 2 || f.ate > 12) throw new Error("Faixas vão de 2x a 12x.");
        if (!(f.pct >= 0 && f.pct <= 20)) throw new Error("Taxa deve ficar entre 0% e 20%.");
      }
      const { error } = await (supabase as any).from("system_parameters")
        .update({ value: { faixas: ordenadas, fixo_cents: fixoCents }, updated_at: new Date().toISOString() })
        .eq("key", CHAVE);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-param", CHAVE] });
      toast.success("Taxas atualizadas. Valem para as próximas cotações.");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "salvar as taxas do cartão", fallback: "Erro ao salvar" }),
  });

  const atualizar = (i: number, campo: keyof Faixa, v: string) =>
    setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: Number(v.replace(",", ".")) } : f)));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">Taxas do Cartão no Anual Parcelado</p>
          <p className="text-xs text-muted-foreground">
            Somadas ao total de 2x a 12x; em 1x não há taxa.
            {data?.updated_at && <> Última alteração: {new Date(data.updated_at).toLocaleString("pt-BR")}.</>}
          </p>
        </div>
        {faixas.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Até</span>
            <Input type="number" min={2} max={12} className="w-16" value={f.ate} onChange={(e) => atualizar(i, "ate", e.target.value)} />
            <span className="text-muted-foreground">parcelas:</span>
            <Input type="number" step="0.01" min={0} max={20} className="w-20" value={f.pct} onChange={(e) => atualizar(i, "pct", e.target.value)} />
            <span className="text-muted-foreground">%</span>
            <Button size="sm" variant="ghost" onClick={() => setFaixas((fs) => fs.filter((_, j) => j !== i))}>Remover</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setFaixas((fs) => [...fs, { ate: 12, pct: 0 }])}>Adicionar Faixa</Button>
          <span className="ml-auto text-sm text-muted-foreground">Fixo por cobrança R$</span>
          <Input className="w-20" value={fixo} onChange={(e) => setFixo(e.target.value)} />
          <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
