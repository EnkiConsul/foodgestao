import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { CompanyRole, PermissionsMap, getDefaultPermissions } from "@/lib/permissions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; full_name: string; role: CompanyRole; permissions: PermissionsMap } | null;
  onSaved: () => void;
}

export function EditMemberPermissionsDialog({ open, onOpenChange, member, onSaved }: Props) {
  const [role, setRole] = useState<CompanyRole>("member");
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setPermissions(
        member.permissions && Object.keys(member.permissions).length > 0
          ? member.permissions
          : getDefaultPermissions(member.role),
      );
    }
  }, [member]);

  const handleRoleChange = (next: CompanyRole) => {
    setRole(next);
    setPermissions(getDefaultPermissions(next));
  };

  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    const { error } = await supabase
      .from("company_members")
      .update({ role: role as any, permissions: permissions as any })
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões de {member?.full_name}</DialogTitle>
          <DialogDescription>Defina o papel e o nível de acesso por módulo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => handleRoleChange(v as CompanyRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — acesso total</SelectItem>
                <SelectItem value="member">Membro — permissões customizáveis</SelectItem>
                <SelectItem value="viewer">Visualizador — somente leitura</SelectItem>
                <SelectItem value="contabilidade">Contabilidade — somente leitura, apenas contas contábeis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PermissionsEditor role={role} value={permissions} onChange={setPermissions} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
