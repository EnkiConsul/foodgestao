import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import {
  CompanyRole, ModulosMap, MODULOS_TODOS, PERFIS, PerfilKey, PermissionsMap, getPerfil, perfilPadraoDoRole,
} from "@/lib/permissions";

export interface EditableMember {
  id: string;
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
  canAssignOwner?: boolean;
  onSaved: () => void;
}

export function EditMemberPermissionsDialog({ open, onOpenChange, member, canAssignOwner, onSaved }: Props) {
  const [perfil, setPerfil] = useState<PerfilKey>("personalizado");
  const [role, setRole] = useState<CompanyRole>("member");
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [modulos, setModulos] = useState<ModulosMap>(MODULOS_TODOS);
  const [flags, setFlags] = useState({ ver_saldos: true, ver_salarios: true });
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const applyPerfil = (k: PerfilKey) => {
    const p = getPerfil(k);
    setPerfil(k); setRole(p.role); setPermissions(p.permissions); setModulos(p.modulos);
    setFlags({ ver_saldos: p.ver_saldos, ver_salarios: p.ver_salarios });
  };

  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("company_members")
      .update({
        role, perfil, permissions, modulos,
        ver_saldos: flags.ver_saldos, ver_salarios: flags.ver_salarios,
        situacao: ativo ? "ativo" : "bloqueado",
      })
      .eq("id", member.id);
    if (error) {
      toast.error("Erro ao salvar permissões", { description: error.message });
    } else {
      toast.success("Permissões atualizadas");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões de {member?.full_name}</DialogTitle>
          <DialogDescription>Perfil, módulos e nível de acesso nesta empresa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Tipo de perfil</Label>
              <Select value={perfil} onValueChange={(v) => applyPerfil(v as PerfilKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERFIS.filter((p) => p.key !== "dono" || canAssignOwner || member?.role === "owner").map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label} — {p.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 rounded-md border px-3 h-10 text-sm">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              {ativo ? "Acesso ativo" : "Acesso bloqueado"}
            </label>
          </div>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
