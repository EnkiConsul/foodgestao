import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Settings, CalendarClock, ShieldAlert, Save, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type DiaConfig = {
  id: string;
  data: string;
  limite_folgas: number;
  observacao: string | null;
  unidade_id: string | null;
};

export default function DpConfiguracoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const [novaData, setNovaData] = useState("");
  const [novoLimite, setNovoLimite] = useState<string>("");
  const [novaObs, setNovaObs] = useState("");
  const [toDelete, setToDelete] = useState<DiaConfig | null>(null);

  const dias = useQuery({
    queryKey: ["dp_dia_config_all", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DiaConfig[]> => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("id, data, limite_folgas, observacao, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", hoje)
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ id, data, limite, observacao }: { id?: string; data: string; limite: number; observacao: string | null }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (id) {
        const { error } = await supabase
          .from("dp_dia_config")
          .update({ limite_folgas: limite, observacao })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_dia_config")
          .insert({ company_id: selectedCompanyId, data, limite_folgas: limite, observacao });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["dp_dia_config_all"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config_hub"] });
      setNovaData(""); setNovoLimite(""); setNovaObs("");
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_dia_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração removida");
      qc.invalidateQueries({ queryKey: ["dp_dia_config_all"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
      qc.invalidateQueries({ queryKey: ["dp_dia_config_hub"] });
    },
    onError: (e) => toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) }),
  });

  const rows = useMemo(() => dias.data ?? [], [dias.data]);

  const handleAdd = () => {
    if (!novaData) return toast.error("Selecione a data");
    const lim = Number(novoLimite);
    if (!Number.isFinite(lim) || lim < 0) return toast.error("Limite inválido");
    upsert.mutate({ data: novaData, limite: lim, observacao: novaObs.trim() || null });
  };

  const handleUpdateRow = (row: DiaConfig, campo: "limite_folgas" | "observacao", valor: string) => {
    if (campo === "limite_folgas") {
      const lim = Number(valor);
      if (!Number.isFinite(lim) || lim < 0) return;
      upsert.mutate({ id: row.id, data: row.data, limite: lim, observacao: row.observacao });
    } else {
      upsert.mutate({ id: row.id, data: row.data, limite: row.limite_folgas, observacao: valor.trim() || null });
    }
  };

  return (
    <DpPage>
      <Helmet><title>Configurações do DP — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Settings}
        title="Configurações do DP"
        description="Consolide regras de folga, bloqueios e prazos gerais do departamento pessoal."
      />

      <DpContentCard>
        <div className="mb-4">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" /> Limites de folga por dia
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Defina, por data, quantas folgas simultâneas são permitidas. Sem configuração, o sistema usa o fallback padrão.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-[160px_120px_1fr_auto] items-end mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limite</Label>
            <Input type="number" min={0} value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} placeholder="Ex: 3" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={novaObs} onChange={(e) => setNovaObs(e.target.value)} placeholder="Ex: feriado municipal" />
          </div>
          <Button onClick={handleAdd} disabled={upsert.isPending}>
            <Save className="size-4 mr-2" /> Adicionar
          </Button>
        </div>

        {/* Mobile: cartões editáveis */}
        <ul className="space-y-3 md:hidden">
          {dias.isLoading && (
            <li className="py-6 text-center text-sm text-muted-foreground">Carregando...</li>
          )}
          {!dias.isLoading && rows.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma configuração futura cadastrada.
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                <Button variant="ghost" size="icon" onClick={() => setToDelete(r)} className="size-9">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Limite de folgas</Label>
                  <Input
                    type="number"
                    min={0}
                    defaultValue={r.limite_folgas}
                    onBlur={(e) => {
                      if (Number(e.target.value) !== r.limite_folgas) handleUpdateRow(r, "limite_folgas", e.target.value);
                    }}
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Observação</Label>
                  <Input
                    defaultValue={r.observacao ?? ""}
                    onBlur={(e) => {
                      if ((e.target.value || null) !== r.observacao) handleUpdateRow(r, "observacao", e.target.value);
                    }}
                    className="h-10"
                    placeholder="—"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Data</TableHead>
                <TableHead className="w-32">Limite</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dias.isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              )}
              {!dias.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma configuração futura cadastrada.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={r.limite_folgas}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== r.limite_folgas) handleUpdateRow(r, "limite_folgas", e.target.value);
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={r.observacao ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== r.observacao) handleUpdateRow(r, "observacao", e.target.value);
                      }}
                      className="h-8"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(r)} className="size-8">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DpContentCard>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-5 text-primary" /> Bloqueios e restrições</CardTitle>
            <CardDescription>Datas bloqueadas, regras recorrentes e feriados sem folga.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/dp/bloqueios">Abrir gestão de bloqueios</Link>
            </Button>
          </CardContent>
        </Card>

      </div>



      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover configuração desta data?</AlertDialogTitle>
            <AlertDialogDescription>
              O dia voltará a seguir o limite padrão calculado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
