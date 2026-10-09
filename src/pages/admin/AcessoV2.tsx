import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError } from "@/lib/notifyError";

type Linha = { company_id: string; company_name?: string; module: string; legacy_allowed: boolean; legacy_motivo: string | null; v2_allowed: boolean; v2_motivo: string | null; dia?: string; ocorrencias?: number; origem?: string };

const MODOS = [
  { v: "legado", l: "Legado", d: "Decisão atual; nada é registrado." },
  { v: "sombra", l: "Sombra", d: "Decisão atual; diferenças do v2 são registradas." },
  { v: "v2", l: "V2", d: "Acesso decidido por empresa e módulo." },
];

export default function AdminAcessoV2() {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("todos");
  const [origem, setOrigem] = useState("todas");

  const modo = useQuery({
    queryKey: ["access-model-mode"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("access_model_mode" as any);
      if (error) throw error;
      return data as unknown as string;
    },
  });
  const diffs = useQuery({
    queryKey: ["access-shadow-diffs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_shadow_diffs" as any).select("*").order("dia", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });
  const simulacao = useQuery({
    queryKey: ["access-v2-compare"],
    enabled: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("access_v2_compare_all" as any);
      if (error) throw error;
      return ((data ?? []) as unknown as Linha[]).filter((l) => l.legacy_allowed !== l.v2_allowed);
    },
  });
  const alterar = useMutation({
    mutationFn: async (m: string) => {
      const { error } = await supabase.rpc("access_model_set_mode" as any, { _mode: m });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo de acesso atualizado.");
      qc.invalidateQueries({ queryKey: ["access-model-mode"] });
      qc.invalidateQueries({ queryKey: ["company-entitlements"] });
    },
    onError: (e: Error) => notifyError(e, { surface: "Acesso V2", action: "alterar o modelo", fallback: "Não foi possível alterar o modelo de acesso." }),
  });

  const fonte = simulacao.data ?? diffs.data ?? [];
  const motivos = useMemo(() => Array.from(new Set(fonte.map((l) => l.v2_motivo ?? "liberado"))), [fonte]);
  const linhas = fonte.filter((l) => (motivo === "todos" || (l.v2_motivo ?? "liberado") === motivo) && (origem === "todas" || (l.origem ?? "app") === origem));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Modelo de Acesso V2</h1>
        <p className="text-sm text-muted-foreground">Controle de acesso por empresa e módulo, com comparação silenciosa antes da virada.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modo Atual</CardTitle>
          <CardDescription>{MODOS.find((m) => m.v === modo.data)?.d}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {MODOS.map((m) => (
            <Button key={m.v} variant={modo.data === m.v ? "default" : "outline"} disabled={alterar.isPending}
              onClick={() => modo.data !== m.v && alterar.mutate(m.v)}>{m.l}</Button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{simulacao.data ? "Simulação: Todas as Empresas" : "Diferenças Registradas"}</CardTitle>
            <CardDescription>Legado x V2 — somente leitura.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as origens</SelectItem>
                <SelectItem value="app">App Gestão</SelectItem>
                <SelectItem value="portal">Portal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motivos</SelectItem>
                {motivos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => simulacao.refetch()} disabled={simulacao.isFetching}>Simular Agora</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Empresa</th><th>Módulo</th><th>Origem</th><th>Legado</th><th>V2</th><th>Motivo V2</th>{!simulacao.data && <th>Dia</th>}</tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2">{l.company_name ?? l.company_id}</td>
                  <td>{l.module === "pessoas" ? "Pessoas" : "Financeiro"}</td>
                  <td><Badge variant="outline">{l.origem === "portal" ? "Portal" : "App"}</Badge></td>
                  <td><Badge variant={l.legacy_allowed ? "default" : "destructive"}>{l.legacy_allowed ? "Libera" : "Bloqueia"}</Badge></td>
                  <td><Badge variant={l.v2_allowed ? "default" : "destructive"}>{l.v2_allowed ? "Libera" : "Bloqueia"}</Badge></td>
                  <td>{l.v2_motivo ?? "—"}</td>
                  {!simulacao.data && <td>{l.dia}</td>}
                </tr>
              ))}
              {!linhas.length && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma diferença.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
