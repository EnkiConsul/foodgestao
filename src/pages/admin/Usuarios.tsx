import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useAdminUsuariosAuth, AdminUserTipo } from "@/hooks/useCliente360";
import { dataBR, idCurto } from "@/lib/admin/cliente360";

const TIPO_LABEL: Record<AdminUserTipo, string> = {
  dono: "Dono", membro: "Administrador/Membro", colaborador_portal: "Colaborador do portal", sem_empresa: "Sem empresa",
};

export default function AdminUsuarios() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useAdminUsuariosAuth();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"padrao" | AdminUserTipo | "todos">("padrao");

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    users.forEach((u) => { m[u.tipo] = (m[u.tipo] ?? 0) + 1; });
    return m;
  }, [users]);

  const lista = useMemo(() => {
    const t = busca.toLowerCase().trim();
    return users.filter((u) => {
      if (tipo === "padrao" && u.tipo === "colaborador_portal") return false;
      if (tipo !== "padrao" && tipo !== "todos" && u.tipo !== tipo) return false;
      if (!t) return true;
      return [u.full_name, u.document, u.phone, u.auth?.email].some((v) => v?.toLowerCase().includes(t));
    });
  }, [users, busca, tipo]);

  const toggle = useMutation({
    mutationFn: async ({ id, is_active, full_name }: { id: string; is_active: boolean; full_name: string | null }) => {
      const { error } = await supabase.from("profiles").update({ is_active }).eq("id", id);
      if (error) throw error;
      await supabase.rpc("insert_audit_log", {
        _action: is_active ? "user_activated" : "user_deactivated", _entity_type: "user", _entity_id: id,
        _details: { target_name: full_name || "—" },
      });
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success(v.is_active ? "Login ativado" : "Login desativado"); },
    onError: () => toast.error("Não foi possível alterar o login. Tente novamente."),
  });

  const leads = tipo === "sem_empresa";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Usuários" description="Logins da plataforma por tipo" />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, e-mail, documento" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
          <SelectTrigger className="md:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="padrao">Padrão (sem colaboradores do portal)</SelectItem>
            {(Object.keys(TIPO_LABEL) as AdminUserTipo[]).map((k) => (
              <SelectItem key={k} value={k}>{TIPO_LABEL[k]}{k === "sem_empresa" ? " (leads)" : ""} — {contagem[k] ?? 0}</SelectItem>
            ))}
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground md:ml-auto">{lista.length} usuário(s)</span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>{leads ? "Teste usado" : "Empresas"}</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Login ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
            )) : lista.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name || "—"}</TableCell>
                <TableCell className="text-xs">{u.auth?.email ?? "—"}<div className="text-muted-foreground">{u.phone}</div></TableCell>
                <TableCell><Badge variant={u.tipo === "colaborador_portal" ? "outline" : "secondary"}>{TIPO_LABEL[u.tipo]}</Badge></TableCell>
                <TableCell className="text-xs">
                  {leads ? (u.trial_usado ? "Sim" : "Não") :
                    u.companies.length === 0 ? "—" : u.companies.map((c) => <div key={c.id}>{c.name} <span className="text-muted-foreground">({idCurto(null, c.id)})</span></div>)}
                </TableCell>
                <TableCell className="text-xs">{dataBR(u.auth?.created_at ?? u.created_at)}</TableCell>
                <TableCell className="text-xs">{dataBR(u.auth?.last_sign_in_at)}</TableCell>
                <TableCell>
                  <Switch checked={u.is_active} disabled={toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ id: u.id, is_active: v, full_name: u.full_name })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
