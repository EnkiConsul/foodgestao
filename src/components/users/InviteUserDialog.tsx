import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PermissionsEditor } from "@/components/users/PermissionsEditor";
import { CompanyRole, ModulosMap, PERFIS, PerfilKey, PermissionsMap, getPerfil, perfilPadraoDoRole } from "@/lib/permissions";
import { isValidPhone, maskPhone } from "@/lib/phone";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  defaultRole?: CompanyRole;
  onSuccess: () => void;
}

export function whatsappInviteLink(phoneDigits: string, nome: string, link: string) {
  const msg = `Olá, ${nome.split(" ")[0] ?? ""}! Você foi convidado para acessar o Aveto 360. Crie sua senha pelo link: ${link}`;
  return `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(msg)}`;
}

export function InviteUserDialog({ open, onOpenChange, companyId, defaultRole, onSuccess }: InviteUserDialogProps) {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<PerfilKey>(perfilPadraoDoRole(defaultRole ?? "member"));
  const preset = getPerfil(perfil);
  const [permissions, setPermissions] = useState<PermissionsMap>(preset.permissions);
  const [modulos, setModulos] = useState<ModulosMap>(preset.modulos);
  const [flags, setFlags] = useState({ ver_saldos: preset.ver_saldos, ver_salarios: preset.ver_salarios });
  const [empresas, setEmpresas] = useState<string[]>([companyId]);
  const [saving, setSaving] = useState(false);

  const { data: adminCompanies = [] } = useQuery({
    queryKey: ["invite-admin-companies", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("company_id, role, companies(name)")
        .eq("user_id", user!.id)
        .in("role", ["owner", "admin"]);
      return (data ?? []).map((d: any) => ({ id: d.company_id as string, name: d.companies?.name as string, role: d.role as string }));
    },
  });

  // Só dono pode convidar outro dono.
  const perfisDisponiveis = useMemo(() => {
    const souDono = adminCompanies.some((c) => c.id === companyId && c.role === "owner");
    return PERFIS.filter((p) => p.key !== "dono" || souDono);
  }, [adminCompanies, companyId]);

  useEffect(() => {
    if (open) setEmpresas([companyId]);
  }, [open, companyId]);

  const applyPerfil = (k: PerfilKey) => {
    const p = getPerfil(k);
    setPerfil(k);
    setPermissions(p.permissions);
    setModulos(p.modulos);
    setFlags({ ver_saldos: p.ver_saldos, ver_salarios: p.ver_salarios });
  };

  const reset = () => {
    setNome(""); setWhatsapp(""); setEmail("");
    applyPerfil("personalizado");
  };

  const waDigits = whatsapp.replace(/\D/g, "");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = nome.trim().length >= 3 && isValidPhone(whatsapp) && emailOk && empresas.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !valid) return;
    setSaving(true);
    const grupoId = crypto.randomUUID();
    const rows = empresas.map((cid) => ({
      company_id: cid,
      invited_email: email.trim().toLowerCase() || null,
      full_name: nome.trim().toUpperCase(),
      whatsapp: waDigits,
      role: preset.role as any,
      perfil,
      permissions: permissions as any,
      modulos: modulos as any,
      ver_saldos: flags.ver_saldos,
      ver_salarios: flags.ver_salarios,
      invited_by: user.id,
      grupo_id: grupoId,
    }));
    const { data, error } = await (supabase as any)
      .from("company_invites")
      .insert(rows)
      .select("token, id, company_id");

    if (error || !data?.length) {
      toast.error("Erro ao criar convite", { description: error?.message });
      setSaving(false);
      return;
    }

    const principal = data.find((d: any) => d.company_id === companyId) ?? data[0];
    const link = `${window.location.origin}/convite/${principal.token}`;
    const waLink = whatsappInviteLink(waDigits, nome.trim(), link);

    supabase.functions
      .invoke("send-company-invite", { body: { inviteId: principal.id } })
      .then(({ data: r, error: fnErr }) => {
        const res = r as { whatsapp?: boolean; email?: boolean } | null;
        if (fnErr || (!res?.whatsapp && !res?.email)) {
          toast.warning("Convite criado, mas o envio automático falhou.", {
            description: "Envie o link pelo WhatsApp manualmente.",
            action: { label: "Abrir WhatsApp", onClick: () => window.open(waLink, "_blank") },
            duration: 15000,
          });
        } else if (!res?.whatsapp) {
          toast.info("E-mail enviado. O WhatsApp automático não saiu.", {
            action: { label: "Abrir WhatsApp", onClick: () => window.open(waLink, "_blank") },
            duration: 15000,
          });
        }
      });

    toast.success("Convite criado!", {
      description: "Enviamos o link por WhatsApp" + (email.trim() ? " e e-mail." : "."),
      action: { label: "Copiar link", onClick: () => navigator.clipboard.writeText(link) },
      duration: 10000,
    });

    onSuccess();
    reset();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
          <DialogDescription>O convite vai por WhatsApp e e-mail, com o link para criar a senha.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inv-nome">Nome completo *</Label>
              <Input id="inv-nome" value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} maxLength={120} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-wa">WhatsApp *</Label>
              <Input id="inv-wa" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(99) 99999-9999" required />
              {whatsapp && !isValidPhone(whatsapp) && <p className="text-[11px] text-destructive">WhatsApp inválido</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">E-mail (opcional)</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@exemplo.com" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipo de perfil *</Label>
              <Select value={perfil} onValueChange={(v) => applyPerfil(v as PerfilKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {perfisDisponiveis.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label} — {p.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {adminCompanies.length > 1 && (
            <div className="space-y-2">
              <Label>Empresas com acesso *</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {adminCompanies.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={empresas.includes(c.id)}
                      onCheckedChange={(ch) =>
                        setEmpresas((prev) => (ch ? [...new Set([...prev, c.id])] : prev.filter((x) => x !== c.id)))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">As mesmas permissões valem para as empresas marcadas. Depois você pode ajustar por empresa.</p>
            </div>
          )}

          <PermissionsEditor
            role={preset.role}
            value={permissions}
            onChange={(p) => { setPermissions(p); if (perfil !== "dono" && perfil !== "administrador") setPerfil("personalizado"); }}
            modulos={modulos}
            onModulosChange={setModulos}
            verSaldos={flags.ver_saldos}
            verSalarios={flags.ver_salarios}
            onFlagsChange={setFlags}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !valid}>{saving ? "Enviando..." : "Enviar convite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
