import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Users, UserPlus, Crown, Shield, User, Eye, Trash2, Clock, Copy, XCircle, Settings2, Calculator } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { EditMemberPermissionsDialog } from "@/components/users/EditMemberPermissionsDialog";
import { CompanyRole, PermissionsMap } from "@/lib/permissions";

const roleBadge = (role: string) => {
  switch (role) {
    case "owner":
      return <Badge className="bg-purple-500/15 text-purple-700 border-purple-200 dark:text-purple-400"><Crown className="h-3 w-3 mr-1" />Dono</Badge>;
    case "admin":
      return <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
    case "contabilidade":
      return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400"><Calculator className="h-3 w-3 mr-1" />Contabilidade</Badge>;
    case "viewer":
      return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400"><Eye className="h-3 w-3 mr-1" />Visualizador</Badge>;
    default:
      return <Badge variant="secondary"><User className="h-3 w-3 mr-1" />Membro</Badge>;
  }
};

const statusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case "accepted":
      return <Badge variant="outline" className="text-green-600 border-green-300">Aceito</Badge>;
    case "rejected":
      return <Badge variant="outline" className="text-red-600 border-red-300">Rejeitado</Badge>;
    case "expired":
      return <Badge variant="outline" className="text-muted-foreground">Expirado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function GestaoUsuarios() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [inviteOpen, setInviteOpen] = useState(location.state?.openInvite ?? false);
  const [inviteDefaultRole] = useState<CompanyRole>(location.state?.defaultRole ?? "member");
  const [editingMember, setEditingMember] = useState<{ id: string; full_name: string; role: CompanyRole; permissions: PermissionsMap } | null>(null);

  useEffect(() => {
    if (location.state?.openInvite) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  // Fetch companies where user is a member
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["user-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("company_id, role, companies(id, name)")
        .eq("user_id", user!.id);
      return (data ?? []).map((d: any) => ({
        id: d.companies.id,
        name: d.companies.name,
        role: d.role,
      }));
    },
  });

  // Auto-select first company
  const activeCompanyId = selectedCompanyId || companies[0]?.id || "";
  const userRole = companies.find((c: any) => c.id === activeCompanyId)?.role;
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  // Fetch members
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["company-members", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("id, user_id, role, permissions, created_at")
        .eq("company_id", activeCompanyId)
        .order("created_at");

      if (!data) return [];

      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await (supabase as any)
        .from("company_member_profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(((profiles ?? []) as Array<{ user_id: string; full_name: string | null }>).map((p) => [p.user_id, p]));

      return data.map((m: any) => ({
        ...m,
        full_name: profileMap.get(m.user_id)?.full_name ?? "Usuário",
      }));
    },
  });

  // Fetch invites
  const { data: invites = [] } = useQuery({
    queryKey: ["company-invites", activeCompanyId],
    enabled: !!activeCompanyId && isAdminOrOwner,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_invites")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase.from("company_members").delete().eq("id", memberId);
    if (error) {
      toast.error("Erro ao remover membro", { description: error.message });
    } else {
      toast.success("Membro removido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["company-members", activeCompanyId] });
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from("company_members")
      .update({ role: newRole as any })
      .eq("id", memberId);
    if (error) {
      toast.error("Erro ao alterar papel", { description: error.message });
    } else {
      toast.success("Papel alterado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["company-members", activeCompanyId] });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    const { error } = await supabase.from("company_invites").delete().eq("id", inviteId);
    if (error) {
      toast.error("Erro ao cancelar convite", { description: error.message });
    } else {
      toast.success("Convite cancelado");
      queryClient.invalidateQueries({ queryKey: ["company-invites", activeCompanyId] });
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/convite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado para a área de transferência!");
  };

  if (loadingCompanies) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Usuários</h1>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Usuários</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Você não possui nenhuma empresa cadastrada. Cadastre uma empresa primeiro para gerenciar usuários.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Gestão de Usuários</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Gerencie os membros da sua empresa</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {companies.length > 1 && (
            <Select value={activeCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdminOrOwner && (
            <Button onClick={() => setInviteOpen(true)} className="min-h-10">
              <UserPlus className="h-4 w-4 mr-2" />
              Convidar
            </Button>
          )}
        </div>
      </div>

      {/* Members */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base md:text-lg">Membros</CardTitle>
          </div>
          <CardDescription className="text-xs">{members.length} membro(s) na empresa</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="hidden sm:table-cell">Desde</TableHead>
                  {isAdminOrOwner && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMembers ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : members.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.full_name}</TableCell>
                    <TableCell>{roleBadge(member.role)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatDate(member.created_at, "dd/MM/yyyy")}
                    </TableCell>
                    {isAdminOrOwner && (
                      <TableCell className="text-right">
                        {member.role !== "owner" && member.user_id !== user?.id && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Editar permissões"
                              onClick={() =>
                                setEditingMember({
                                  id: member.id,
                                  full_name: member.full_name,
                                  role: member.role,
                                  permissions: member.permissions ?? {},
                                })
                              }
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover membro</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja remover <strong>{member.full_name}</strong> da empresa? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRemoveMember(member.id)}>Remover</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {loadingMembers ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum membro</p>
            ) : (
              members.map((member: any) => {
                const canManage = isAdminOrOwner && member.role !== "owner" && member.user_id !== user?.id;
                return (
                  <div key={member.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{member.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">Desde {formatDate(member.created_at, "dd/MM/yyyy")}</p>
                      </div>
                      {roleBadge(member.role)}
                    </div>
                    {canManage && (
                      <div className="flex gap-2 pt-1 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-h-9"
                          onClick={() =>
                            setEditingMember({
                              id: member.id,
                              full_name: member.full_name,
                              role: member.role,
                              permissions: member.permissions ?? {},
                            })
                          }
                        >
                          <Settings2 className="h-4 w-4 mr-1" /> Permissões
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1 min-h-9 text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4 mr-1" /> Remover
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover membro</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja remover <strong>{member.full_name}</strong> da empresa?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveMember(member.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invites */}
      {isAdminOrOwner && invites.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <CardTitle className="text-base md:text-lg">Convites</CardTitle>
            </div>
            <CardDescription className="text-xs">Convites enviados para novos membros</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite: any) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.invited_email}</TableCell>
                      <TableCell>{roleBadge(invite.role)}</TableCell>
                      <TableCell>{statusBadge(invite.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {invite.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleCopyLink(invite.token)}
                                title="Copiar link"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleCancelInvite(invite.id)}
                                title="Cancelar convite"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {invites.map((invite: any) => (
                <div key={invite.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate min-w-0">{invite.invited_email}</p>
                    {statusBadge(invite.status)}
                  </div>
                  <div>{roleBadge(invite.role)}</div>
                  {invite.status === "pending" && (
                    <div className="flex gap-2 pt-1 border-t">
                      <Button variant="outline" size="sm" className="flex-1 min-h-9" onClick={() => handleCopyLink(invite.token)}>
                        <Copy className="h-4 w-4 mr-1" /> Copiar link
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 min-h-9 text-destructive hover:text-destructive" onClick={() => handleCancelInvite(invite.id)}>
                        <XCircle className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        companyId={activeCompanyId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["company-invites", activeCompanyId] })}
      />

      <EditMemberPermissionsDialog
        open={!!editingMember}
        onOpenChange={(o) => { if (!o) setEditingMember(null); }}
        member={editingMember}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["company-members", activeCompanyId] })}
      />
    </div>
  );
}
