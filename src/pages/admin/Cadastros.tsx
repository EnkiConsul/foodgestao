import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Mail, Pencil, MailCheck, Copy } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";

type Row = {
  id: string;
  user_id: string;
  full_name: string | null;
  document: string | null;
  phone: string | null;
  profile_type: string;
  currency: string;
  timezone: string;
  onboarding_completed: boolean;
  onboarding_data: any;
  is_active: boolean;
  created_at: string;
  auth: {
    email: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
  } | null;
};

export default function AdminCadastros() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Partial<Row>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-cadastros"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-list-users-auth");
      if (error) throw error;
      return (data as { users: Row[] }).users;
    },
  });

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    if (!t) return data ?? [];
    return (data ?? []).filter((u) =>
      [u.full_name, u.document, u.phone, u.auth?.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(t)),
    );
  }, [data, search]);

  const saveProfile = useMutation({
    mutationFn: async (payload: Partial<Row> & { id: string }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: rest.full_name ?? null,
          document: rest.document ?? null,
          phone: rest.phone ?? null,
          profile_type: rest.profile_type as any,
          currency: rest.currency ?? "BRL",
          timezone: rest.timezone ?? "America/Sao_Paulo",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro atualizado");
      qc.invalidateQueries({ queryKey: ["admin-cadastros"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const resend = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("admin-resend-confirmation", {
        body: { user_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => toast.success("E-mail de confirmação reenviado"),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reenviar"),
  });

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm(row);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Cadastros"
        description="Gestão completa dos dados cadastrais dos clientes. Edite informações e reenvie e-mails de confirmação."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, e-mail, documento ou telefone..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Confirmação</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="w-[180px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum cadastro encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const confirmed = !!u.auth?.email_confirmed_at;
                return (
                  <TableRow key={u.id} className={!u.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.auth?.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">{u.profile_type}</Badge>
                    </TableCell>
                    <TableCell>{u.document || "—"}</TableCell>
                    <TableCell>{u.phone || "—"}</TableCell>
                    <TableCell>
                      {confirmed ? (
                        <Badge variant="default" className="gap-1"><MailCheck className="h-3 w-3" /> Confirmado</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1"><Mail className="h-3 w-3" /> Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.created_at, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!confirmed && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resend.isPending}
                            onClick={() => resend.mutate(u.user_id)}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1" /> Reenviar
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar cadastro</SheetTitle>
            <SheetDescription>
              {editing?.auth?.email ?? "Dados cadastrais do cliente"}
            </SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="mt-6 space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Dados de acesso</h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div>
                      <div className="text-xs text-muted-foreground">E-mail</div>
                      <div>{editing.auth?.email ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editing.auth?.email_confirmed_at ? (
                        <Badge variant="default">Confirmado</Badge>
                      ) : (
                        <>
                          <Badge variant="secondary">Pendente</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resend.isPending}
                            onClick={() => resend.mutate(editing.user_id)}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1" /> Reenviar
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(editing.auth?.email ?? "");
                          toast.success("E-mail copiado");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Último login: {editing.auth?.last_sign_in_at ? formatDate(editing.auth.last_sign_in_at, "dd/MM/yyyy HH:mm") : "—"}</div>
                    <div>Criado em: {formatDate(editing.created_at, "dd/MM/yyyy HH:mm")}</div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Dados cadastrais</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>Nome completo</Label>
                    <Input
                      value={form.full_name ?? ""}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo</Label>
                      <select
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={form.profile_type ?? "pf"}
                        onChange={(e) => setForm({ ...form, profile_type: e.target.value })}
                      >
                        <option value="pf">Pessoa Física</option>
                        <option value="pj">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <Label>Documento</Label>
                      <Input
                        value={form.document ?? ""}
                        onChange={(e) => setForm({ ...form, document: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Telefone</Label>
                      <Input
                        value={form.phone ?? ""}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Moeda</Label>
                      <Input
                        value={form.currency ?? "BRL"}
                        onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Timezone</Label>
                    <Input
                      value={form.timezone ?? "America/Sao_Paulo"}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {editing.onboarding_data && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Onboarding</h3>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-64">
{JSON.stringify(editing.onboarding_data, null, 2)}
                  </pre>
                </section>
              )}
            </div>
          )}

          <SheetFooter className="mt-6 flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={saveProfile.isPending}
              onClick={() => editing && saveProfile.mutate({ ...form, id: editing.id })}
            >
              Salvar alterações
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
