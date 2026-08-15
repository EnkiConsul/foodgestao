import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const SCOPE_OPTIONS: { key: string; label: string; help: string; needsUser?: boolean }[] = [
  { key: "transactions", label: "Lançamentos", help: "Inclui anexos e tags vinculadas" },
  { key: "accounts", label: "Contas financeiras", help: "Saldos e contas cadastradas" },
  { key: "categories", label: "Categorias", help: "Categorias e vínculos com empresas", needsUser: true },
  { key: "contacts", label: "Contatos", help: "Clientes e fornecedores", needsUser: true },
  { key: "payment_methods", label: "Formas de pagamento", help: "Métodos cadastrados", needsUser: true },
  { key: "budgets", label: "Orçamentos", help: "Metas e limites", needsUser: true },
  { key: "cost_centers", label: "Centros de custo", help: "", needsUser: true },
  { key: "tags", label: "Tags", help: "", needsUser: true },
  { key: "companies", label: "Perfis de Acesso (empresas)", help: "Empresas, membros e convites", needsUser: true },
  { key: "audit_logs", label: "Logs de auditoria do alvo", help: "Histórico de ações", needsUser: true },
];

type TargetType = "self" | "user" | "company";
type ContextFilter = "pf" | "pj" | "both";

export function AdminResetData() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<TargetType>("self");
  const [userId, setUserId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [contextFilter, setContextFilter] = useState<ContextFilter>("both");
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-reset-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-reset-companies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  const targetIsUser = targetType === "user" || targetType === "self";
  const targetIsValid =
    targetType === "self" ||
    (targetType === "user" && !!userId) ||
    (targetType === "company" && !!companyId);

  const availableScope = useMemo(
    () => SCOPE_OPTIONS.filter((s) => (s.needsUser ? targetIsUser : true)),
    [targetIsUser]
  );

  const toggleScope = (key: string) => {
    const next = new Set(scope);
    next.has(key) ? next.delete(key) : next.add(key);
    setScope(next);
  };

  const toggleAll = () => {
    if (scope.size === availableScope.length) setScope(new Set());
    else setScope(new Set(availableScope.map((s) => s.key)));
  };

  const handleExecute = async () => {
    if (confirmText !== "APAGAR") {
      toast.error('Digite "APAGAR" para confirmar');
      return;
    }
    setRunning(true);
    const target =
      targetType === "self"
        ? { type: "self" }
        : targetType === "user"
        ? { type: "user", userId }
        : { type: "company", companyId };

    const { data, error } = await supabase.functions.invoke("admin-reset-data", {
      body: { target, scope: Array.from(scope), context: contextFilter },
    });

    setRunning(false);
    if (error) {
      toast.error("Erro ao resetar dados", { description: error.message });
      return;
    }
    if ((data as any)?.error) {
      toast.error("Erro ao resetar dados", { description: (data as any).error });
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

  const targetLabel =
    targetType === "self"
      ? "meus próprios dados"
      : targetType === "user"
      ? users.find((u: any) => u.user_id === userId)?.full_name || "usuário"
      : companies.find((c: any) => c.id === companyId)?.name || "empresa";

  return (
    <div className="space-y-6">
      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Zona de Perigo — Resetar Dados</CardTitle>
          </div>
          <CardDescription>
            Apague registros de forma seletiva para começar do zero. Esta ação é irreversível.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Alvo */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">1. Alvo</Label>
            <RadioGroup value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="self" id="t-self" />
                <Label htmlFor="t-self" className="font-normal">Meus próprios dados</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="user" id="t-user" />
                <Label htmlFor="t-user" className="font-normal">Usuário específico</Label>
              </div>
              {targetType === "user" && (
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="ml-6 max-w-md"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.user_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="company" id="t-company" />
                <Label htmlFor="t-company" className="font-normal">Empresa específica (apaga só dados PJ da empresa)</Label>
              </div>
              {targetType === "company" && (
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger className="ml-6 max-w-md"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </RadioGroup>
          </div>

          <Separator />

          {/* Contexto */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">2. Contexto (PF/PJ)</Label>
            <RadioGroup
              value={contextFilter}
              onValueChange={(v) => setContextFilter(v as ContextFilter)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="both" id="c-both" />
                <Label htmlFor="c-both" className="font-normal">Ambos</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pf" id="c-pf" />
                <Label htmlFor="c-pf" className="font-normal">Apenas PF</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pj" id="c-pj" />
                <Label htmlFor="c-pj" className="font-normal">Apenas PJ</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Filtro aplicado a lançamentos, contas, categorias e orçamentos. Demais itens não diferenciam contexto.
            </p>
          </div>

          <Separator />

          {/* Escopo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">3. O que apagar</Label>
              <Button variant="outline" size="sm" onClick={toggleAll} type="button">
                {scope.size === availableScope.length ? "Desmarcar tudo" : "Marcar tudo"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {availableScope.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={scope.has(opt.key)}
                    onCheckedChange={() => toggleScope(opt.key)}
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{opt.label}</div>
                    {opt.help && <div className="text-xs text-muted-foreground">{opt.help}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="destructive"
              disabled={!targetIsValid || scope.size === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar dados selecionados
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirmar exclusão irreversível
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Você está prestes a apagar permanentemente os dados de <strong>{targetLabel}</strong>.
                </p>
                <p>
                  Itens: <strong>{Array.from(scope).join(", ")}</strong>
                </p>
                <p>
                  Contexto: <strong>{contextFilter === "both" ? "Ambos (PF e PJ)" : contextFilter.toUpperCase()}</strong>
                </p>
                <p className="text-destructive font-medium pt-2">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-input">Digite <strong>APAGAR</strong> para confirmar</Label>
            <Input
              id="confirm-input"
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
    </div>
  );
}
