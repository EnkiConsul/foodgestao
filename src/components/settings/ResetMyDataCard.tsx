import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SCOPE_OPTIONS = [
  { key: "transactions", label: "Lançamentos", help: "Inclui anexos e tags" },
  { key: "accounts", label: "Contas financeiras", help: "Saldos e contas cadastradas" },
  { key: "categories", label: "Categorias", help: "Categorias e vínculos" },
  { key: "contacts", label: "Contatos", help: "Clientes e fornecedores" },
  { key: "payment_methods", label: "Formas de pagamento", help: "" },
  { key: "budgets", label: "Orçamentos", help: "Metas e limites" },
  { key: "cost_centers", label: "Centros de custo", help: "" },
  { key: "tags", label: "Tags", help: "" },
  { key: "companies", label: "Perfis de Acesso (empresas)", help: "Empresas que você criou, membros e convites" },
];

type ContextFilter = "pf" | "pj" | "both";

export function ResetMyDataCard() {
  const queryClient = useQueryClient();
  const [contextFilter, setContextFilter] = useState<ContextFilter>("both");
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);

  const allKeys = useMemo(() => SCOPE_OPTIONS.map((s) => s.key), []);

  const toggleScope = (key: string) => {
    const next = new Set(scope);
    next.has(key) ? next.delete(key) : next.add(key);
    setScope(next);
  };

  const toggleAll = () => {
    if (scope.size === allKeys.length) setScope(new Set());
    else setScope(new Set(allKeys));
  };

  const handleExecute = async () => {
    if (confirmText !== "APAGAR") {
      toast.error('Digite "APAGAR" para confirmar');
      return;
    }
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-data", {
      body: { target: { type: "self" }, scope: Array.from(scope), context: contextFilter },
    });
    setRunning(false);

    if (error) {
      toast.error("Erro ao apagar dados", { description: error.message });
      return;
    }
    if ((data as any)?.error) {
      toast.error("Erro ao apagar dados", { description: (data as any).error });
      return;
    }
    const counts = (data as any)?.counts ?? {};
    const total = Object.values(counts).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    toast.success(`${total} registros apagados`, {
      description: Object.entries(counts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" • "),
    });
    setConfirmOpen(false);
    setConfirmText("");
    setScope(new Set());
    queryClient.invalidateQueries();
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg">Zona de Perigo — Apagar meus dados</CardTitle>
        </div>
        <CardDescription>
          Recomece do zero apagando seletivamente seus dados. Esta ação é irreversível e não remove sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Contexto</Label>
          <RadioGroup
            value={contextFilter}
            onValueChange={(v) => setContextFilter(v as ContextFilter)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="r-both" />
              <Label htmlFor="r-both" className="font-normal">Ambos</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pf" id="r-pf" />
              <Label htmlFor="r-pf" className="font-normal">Apenas PF</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pj" id="r-pj" />
              <Label htmlFor="r-pj" className="font-normal">Apenas PJ</Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">O que apagar</Label>
            <Button variant="outline" size="sm" onClick={toggleAll} type="button">
              {scope.size === allKeys.length ? "Desmarcar tudo" : "Marcar tudo"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCOPE_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox checked={scope.has(opt.key)} onCheckedChange={() => toggleScope(opt.key)} />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.help && <div className="text-xs text-muted-foreground">{opt.help}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="destructive"
            disabled={scope.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Apagar dados selecionados
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirmar exclusão irreversível
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Você apagará permanentemente seus próprios dados.</p>
                <p>Itens: <strong>{Array.from(scope).join(", ")}</strong></p>
                <p>Contexto: <strong>{contextFilter === "both" ? "Ambos (PF e PJ)" : contextFilter.toUpperCase()}</strong></p>
                <p className="text-destructive font-medium pt-2">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-input-self">Digite <strong>APAGAR</strong> para confirmar</Label>
            <Input
              id="confirm-input-self"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="APAGAR"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExecute();
              }}
              disabled={running || confirmText !== "APAGAR"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Apagar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
