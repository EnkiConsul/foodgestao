import { Helmet } from "react-helmet-async";
import { useState } from "react";
import {
  Plus, Calendar, CalendarX, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import {
  MESES, getMonthName,
  emptyRegraForm, regraToFormState,
  type Regra, type DataBloq,
  type RegraFormState, type DataFormState,
} from "@/lib/dp/bloqueios";
import { useDpBloqueios } from "@/hooks/useDpBloqueios";
import { RegraDialog } from "@/components/dp/bloqueios/RegraDialog";
import { DataDialog } from "@/components/dp/bloqueios/DataDialog";
import { RegraRow as RegraRowUI } from "@/components/dp/bloqueios/RegraRow";
import { DataRow } from "@/components/dp/bloqueios/DataRow";

export default function DpBloqueios() {
  const embedded = useDpEmbedded();
  // Filtros
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesFiltro, setMesFiltro] = useState<string>("all");
  const [aplicacaoFiltro, setAplicacaoFiltro] = useState<string>("all");
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>("all");
  const [showPast, setShowPast] = useState(false);
  // (regeneração manual removida — regras valem em runtime)

  // Dialogs
  const [regraOpen, setRegraOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [editRegraId, setEditRegraId] = useState<string | null>(null);
  const [editDataId, setEditDataId] = useState<string | null>(null);

  const [regraForm, setRegraForm] = useState<RegraFormState>(emptyRegraForm);
  const [dataForm, setDataForm] = useState<DataFormState>({ data: "", motivo: "", unidade_id: "" });
  const {
    unidades,
    regrasLoading,
    datasLoading,
    regrasFiltradas,
    datasFiltradas,
    saveRegra,
    delRegra,
    saveData,
    delData,
    rebloquear,
    liberar,
  } = useDpBloqueios({ anoFiltro, mesFiltro, aplicacaoFiltro, unidadeFiltro, showPast });


  // ---- Handlers de abertura ----
  const openNovaRegra = () => {
    setEditRegraId(null);
    setRegraForm(emptyRegraForm);
    setRegraOpen(true);
  };
  const openEditRegra = (r: Regra) => {
    setEditRegraId(r.id);
    setRegraForm(regraToFormState(r));
    setRegraOpen(true);
  };
  const openNovaData = () => {
    setEditDataId(null);
    setDataForm({ data: "", motivo: "", unidade_id: "" });
    setDataOpen(true);
  };
  const openEditData = (d: DataBloq) => {
    setEditDataId(d.id);
    setDataForm({ data: d.data, motivo: d.motivo, unidade_id: d.unidade_id ?? "" });
    setDataOpen(true);
  };

  return (
    <DpPage>
      {!embedded && (
        <Helmet><title>Datas Bloqueadas — Pessoas 360°</title></Helmet>
      )}
      <DpPageHeader
        icon={CalendarX}
        title="Datas Bloqueadas"
        description="Configure regras automáticas e bloqueios manuais. Regras ativas passam a valer imediatamente em todo o sistema."
      />

      <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
        {/* Filtros + ações: valem para as duas listas */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Ano</Label>
            <Input type="number" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))} className="w-[120px]" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Mês</Label>
            <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-full sm:w-[180px]">
              <option value="all">Todos</option>
              {MESES.map((m) => <option key={m} value={m}>{getMonthName(m)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Aplicação</Label>
            <select value={aplicacaoFiltro} onChange={(e) => setAplicacaoFiltro(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-full sm:w-[160px]">
              <option value="all">Todas</option>
              <option value="anual">🔄 Anual</option>
              <option value="unica">🔹 Única vez</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Unidade</Label>
            <select value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary w-full sm:w-[180px]">
              <option value="all">Todas</option>
              <option value="__global__">Global</option>
              {(unidades).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowPast(!showPast)} className="flex items-center gap-2">
            {showPast ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {showPast ? "Ocultar passadas" : "Mostrar passadas"}
          </Button>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            <Button className="rounded-full px-6" onClick={openNovaRegra}>
              <Plus className="size-4 mr-2" /> Nova Regra
            </Button>
            <Button variant="outline" className="rounded-full px-6" onClick={openNovaData}>
              <CalendarX className="size-4 mr-2" /> Bloquear Data
            </Button>
          </div>
        </div>

        <Separator />

        <Tabs defaultValue="regras" className="space-y-4">
          <DpTabsBar>
            <TabsTrigger value="regras" className="gap-2">
              <Calendar className="size-4" /> Regras Automáticas ({regrasFiltradas.length})
            </TabsTrigger>
            <TabsTrigger value="datas" className="gap-2">
              <CalendarX className="size-4" /> Datas Bloqueadas ({datasFiltradas.length})
            </TabsTrigger>
          </DpTabsBar>

          <TabsContent value="regras" className="mt-0">
            <div className="rounded-2xl border border-border overflow-hidden">
              {regrasLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando…</div>
              ) : regrasFiltradas.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhuma regra configurada.</div>
              ) : (
                <div className="divide-y divide-border">
                  {regrasFiltradas.map((r) => (
                    <RegraRowUI
                      key={r.id}
                      regra={r}
                      onEdit={openEditRegra}
                      onDelete={(id) => delRegra.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="datas" className="mt-0">
            <div className="rounded-2xl border border-border overflow-hidden">
              {datasLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando…</div>
              ) : datasFiltradas.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhuma data bloqueada neste período.</div>
              ) : (
                <div className="divide-y divide-border">
                  {datasFiltradas.map((d) => (
                    <DataRow
                      key={d.id}
                      data={d}
                      onEdit={openEditData}
                      onDelete={(id) => delData.mutate(id)}
                      onRebloquear={(row) => rebloquear.mutate(row)}
                      onLiberar={(row) => liberar.mutate(row)}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DpContentCard>


      <RegraDialog
        open={regraOpen}
        isEditing={!!editRegraId}
        form={regraForm}
        unidades={unidades}
        saving={saveRegra.isPending}
        onChange={(updater) => setRegraForm(updater)}
        onCancel={() => { setRegraOpen(false); setEditRegraId(null); }}
        onSubmit={() => saveRegra.mutate(
          { form: regraForm, editId: editRegraId },
          { onSuccess: () => { setRegraOpen(false); setEditRegraId(null); } },
        )}

      />

      <DataDialog
        open={dataOpen}
        isEditing={!!editDataId}
        form={dataForm}
        unidades={unidades}
        saving={saveData.isPending}
        onChange={(updater) => setDataForm(updater)}
        onCancel={() => { setDataOpen(false); setEditDataId(null); }}
        onSubmit={() => saveData.mutate(
          { form: dataForm, editId: editDataId },
          { onSuccess: () => { setDataOpen(false); setEditDataId(null); } },
        )}

      />
    </DpPage>
  );
}
