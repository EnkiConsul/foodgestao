import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { CompanyRole, PermissionsMap, getDefaultPermissions } from "@/lib/permissions";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  defaultRole?: CompanyRole;
  onSuccess: () => void;
}

export function InviteUserDialog({ open, onOpenChange, companyId, defaultRole, onSuccess }: InviteUserDialogProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>(defaultRole ?? "member");
  const [permissions, setPermissions] = useState<PermissionsMap>(() => getDefaultPermissions(defaultRole ?? "member"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(defaultRole ?? "member");
    setPermissions(getDefaultPermissions(defaultRole ?? "member"));
  }, [defaultRole]);

  useEffect(() => {
    setPermissions(getDefaultPermissions(role));
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !email.trim()) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("company_invites")
      .insert({
        company_id: companyId,
        invited_email: email.trim().toLowerCase(),
        role: role as any,
        permissions: permissions as any,
        invited_by: user.id,
      })
      .select("token, id")
      .single();

    if (error) {
      toast.error("Erro ao enviar convite", { description: error.message });
      setSaving(false);
      return;
    }

    const link = `${window.location.origin}/convite/${data.token}`;

    // Fire-and-forget email send. If it fails, the link is still usable.
    supabase.functions
      .invoke("send-company-invite", { body: { inviteId: data.id } })
      .then(({ error: fnErr }) => {
        if (fnErr) {
          toast.warning("Convite criado, mas não foi possível enviar o e-mail automaticamente.", {
            description: "Copie o link e envie manualmente.",
          });
        }
      });


    toast.success("Convite enviado!", {
      description: "O convidado receberá um e-mail com o link de acesso.",
      action: {
        label: "Copiar link",
        onClick: () => navigator.clipboard.writeText(link),
      },
      duration: 10000,
    });

    onSuccess();
    setEmail("");
    setRole("member");
    setPermissions(getDefaultPermissions("member"));
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar Membro</DialogTitle>
          <DialogDescription>
            Envie um convite com permissões personalizadas por módulo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CompanyRole)}>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !email.trim()}>
              {saving ? "Enviando..." : "Enviar Convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
