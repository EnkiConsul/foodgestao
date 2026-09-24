import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { CompanyAccessPicker } from "@/components/users/CompanyAccessPicker";
import { useAdminCompanies } from "@/hooks/useAdminCompanies";
import {
  CompanyRole, ModulosMap, MODULOS_TODOS, PERFIS, PerfilKey, PermissionsMap, getPerfil, perfilPadraoDoRole,
} from "@/lib/permissions";

export interface EditableMember {
  id: string;
  user_id: string;
  full_name: string;
  role: CompanyRole;
  permissions: PermissionsMap;
  perfil?: string | null;
  modulos?: Partial<ModulosMap> | null;
  ver_saldos?: boolean;
  ver_salarios?: boolean;
  situacao?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: EditableMember | null;
  companyId: string;
  canAssignOwner?: boolean;
  onSaved: () => void;
}

export function EditMemberPermissionsDialog({ open, onOpenChange, member, companyId, canAssignOwner, onSaved }: Props) {
  const [perfil, setPerfil] = useState<PerfilKey>("personalizado");
  const [role, setRole] = useState<CompanyRole>("member");
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [modulos, setModulos] = useState<ModulosMap>(MODULOS_TODOS);
  const [flags, setFlags] = useState({ ver_saldos: true, ver_salarios: true });
  const [ativo, setAtivo] = useState(true);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: adminCompanies = [] } = useAdminCompanies(open);

  // Vínculos atuais do membro nas empresas que o usuário logado administra.
  const { data: vinculos = [], refetch: refetchVinculos } = useQuery({
    queryKey: ["member-company-links", member?.user_id, adminCompanies.map((c) => c.id).join(",")],
    enabled: open && !!member?.user_id && adminCompanies.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("company_members")
        .select("id, company_id, role")
        .eq("user_id", member!.user_id)
        .in("company_id", adminCompanies.map((c) => c.id));
      return (data ?? []) as Array<{ id: string; company_id: string; role: string }>;
    },
  });

  const vinculoPorEmpresa = useMemo(
    () => new Map(vinculos.map((v) => [v.company_id, v])),
    [vinculos],
  );

  useEffect(() => {
    if (!member) return;
    const pk = (member.perfil && member.perfil !== "personalizado" ? member.perfil : perfilPadraoDoRole(member.role)) as PerfilKey;
    setPerfil(pk);
    setRole(member.role);
    setPermissions(member.permissions && Object.keys(member.permissions).length > 0 ? member.permissions : getPerfil(pk).permissions);
    setModulos({ ...MODULOS_TODOS, ...(member.modulos ?? {}) });
    setFlags({ ver_saldos: member.ver_saldos !== false, ver_salarios: member.ver_salarios !== false });
    setAtivo((member.situacao ?? "ativo") === "ativo");
  }, [member]);

  // Marca as empresas onde o membro já tem acesso, sempre incluindo a atual.
  useEffect(() => {
    if (!open) return;
    setEmpresas([...new Set([companyId, ...vinculos.map((v) => v.company_id)])]);
  }, [open, companyId, vinculos]);

  const applyPerfil = (k: PerfilKey) => {
    const p = getPerfil(k);
    setPerfil(k); setRole(p.role); setPermissions(p.permissions); setModulos(p.modulos);
    setFlags({ ver_saldos: p.ver_saldos, ver_salarios: p.ver_salarios });
  };

  const handleSave = async () => {
    if (!member) return;
    if (empresas.length === 0) {
      toast.error("Selecione ao menos uma empresa", {
        description: "Para retirar o acesso de todas, use Remover membro.",
      });
      return;
    }
    setSaving(true);

    const payload = {
      role, perfil, permissions, modulos,
      ver_saldos: flags.ver_saldos, ver_salarios: flags.ver_salarios,
      situacao: ativo ? "ativo" : "bloqueado",
    };

    const selecionadas = new Set(empresas);
    const falhas: string[] = [];
    let adicionadas = 0;
    let removidas = 0;

    if (selecionadas.has(companyId)) {
      const { error } = await (supabase as any)
        .from("company_members")
        .update(payload)
        .eq("id", member.id);

      if (error) {
        toast.error("Erro ao salvar permissões", { description: error.message });
        setSaving(false);
        return;
      }
    } else {
      const { error } = await (supabase as any)
        .from("company_members")
        .delete()
        .eq("id", member.id);

      if (error) {
        toast.error("Erro ao retirar o acesso desta empresa", { description: error.message });
        setSaving(false);
        return;
      }
      removidas++;
    }


    for (const c of adminCompanies) {
      if (c.id === companyId) continue;
      const vinculo = vinculoPorEmpresa.get(c.id);
      const quer = selecionadas.has(c.id);

      if (quer && !vinculo) {
        const { error: e } = await (supabase as any)
          .from("company_members")
          .insert({ company_id: c.id, user_id: member.user_id, ...payload });
        if (e) falhas.push(c.name); else adicionadas++;
      } else if (quer && vinculo) {
        const { error: e } = await (supabase as any)
          .from("company_members")
          .update(payload)
          .eq("id", vinculo.id);
        if (e) falhas.push(c.name);
      } else if (!quer && vinculo) {
        const { error: e } = await (supabase as any)
          .from("company_members")
          .delete()
          .eq("id", vinculo.id);
        if (e) falhas.push(c.name); else removidas++;
      }
    }

    const detalhes = [
      adicionadas ? `${adicionadas} empresa(s) liberada(s)` : null,
      removidas ? `${removidas} empresa(s) removida(s)` : null,
    ].filter(Boolean).join(" · ");

    if (falhas.length) {
      toast.warning("Permissões salvas, mas algumas empresas não foram atualizadas", {
        description: falhas.join(", "),
        duration: 12000,
      });
    } else {
      toast.success("Permissões atualizadas", { description: detalhes || undefined });
    }

    await refetchVinculos();
    onSaved();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-screen max-w-none h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:w-full sm:max-w-3xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">Permissões de {member?.full_name}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">Perfil, empresas com acesso e nível de permissão.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Tipo de perfil</Label>
              <Select value={perfil} onValueChange={(v) => applyPerfil(v as PerfilKey)}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERFIS.filter((p) => p.key !== "dono" || canAssignOwner || member?.role === "owner").map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label} — {p.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-2 rounded-md border px-3 min-h-11 text-sm">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              {ativo ? "Acesso ativo" : "Acesso bloqueado"}
            </label>
          </div>

          <CompanyAccessPicker
            companies={adminCompanies}
            selected={empresas}
            onChange={setEmpresas}
            lockedId={companyId}
            ajuda="Marque para liberar o acesso e desmarque para retirar. A empresa aberta na tela não pode ser desmarcada aqui — use Remover membro. As permissões abaixo valem para todas as empresas marcadas."
          />

          <PermissionsEditor
            role={role}
            value={permissions}
            onChange={(p) => { setPermissions(p); if (role === "member") setPerfil("personalizado"); }}
            modulos={modulos}
            onModulosChange={setModulos}
            verSaldos={flags.ver_saldos}
            verSalarios={flags.ver_salarios}
            onFlagsChange={setFlags}
          />
        </div>
        <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="outline" className="flex-1 min-h-11 sm:flex-none" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="flex-1 min-h-11 sm:flex-none" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
