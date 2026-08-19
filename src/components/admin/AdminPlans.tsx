import { useState } from "react";
import { usePlans, useUpsertPlan, useDeletePlan, usePlanSubscriptionCounts } from "@/hooks/usePlans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PlanEditorDialog } from "./PlanEditorDialog";
import { formatCents, formatLimit } from "@/lib/billing";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AdminPlans() {
  const { data: plans = [], isLoading } = usePlans();
  const { data: subCounts = {} } = usePlanSubscriptionCounts();
  const upsert = useUpsertPlan();
  const del = useDeletePlan();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<any | null>(null);
  const confirmSubs = confirmPlan ? (subCounts[confirmPlan.id] ?? 0) : 0;


  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Gerencie planos, preços e limites de uso.
        </p>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo plano
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p: any) => {
            const f = p.features || {};
            return (
              <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{p.slug}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDel(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold">{formatCents(p.price_cents)}</p>
                    <p className="text-xs text-muted-foreground">
                      /{p.billing_period === "monthly" ? "mês" : "ano"}
                      {p.trial_days > 0 && ` · ${p.trial_days}d trial`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.is_active ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                    {p.is_public ? <Badge variant="secondary">Público</Badge> : <Badge variant="outline">Privado</Badge>}
                    {p.is_featured && <Badge variant="secondary">{p.featured_label || "Destaque"}</Badge>}
                  </div>
                  <div className="text-xs space-y-1 pt-2 border-t">
                    <div className="flex justify-between"><span className="text-muted-foreground">Empresas</span><span>{formatLimit(f.max_companies)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Lançamentos/mês</span><span>{formatLimit(f.max_transactions_per_month)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Anexos/lançamento</span><span>{formatLimit(f.max_attachments_per_transaction)}</span></div>
                    {f.price_per_extra_company_cents > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Perfil extra</span><span>{formatCents(f.price_per_extra_company_cents)} (incl. {f.included_companies ?? f.max_companies})</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">IA</span><span>{f.ai_enabled ? "Sim" : "Não"}</span></div>
                    
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PlanEditorDialog
        open={open}
        onOpenChange={setOpen}
        plan={editing}
        onSave={(data) => upsert.mutate(data, { onSuccess: () => setOpen(false) })}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Assinaturas vinculadas serão impedidas se houverem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDel) del.mutate(confirmDel); setConfirmDel(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
