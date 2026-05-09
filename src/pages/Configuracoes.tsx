import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, Globe, Shield, Save } from "lucide-react";
import { ResetMyDataCard } from "@/components/settings/ResetMyDataCard";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";

const CURRENCIES = [
  { value: "BRL", label: "R$ - Real Brasileiro" },
  { value: "USD", label: "$ - Dólar Americano" },
  { value: "EUR", label: "€ - Euro" },
  { value: "GBP", label: "£ - Libra Esterlina" },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/New_York", label: "Nova York (GMT-5)" },
  { value: "Europe/Lisbon", label: "Lisboa (GMT+0)" },
];

export default function Configuracoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setDocument(profile.document ?? "");
      setCurrency(profile.currency);
      setTimezone(profile.timezone);
      setPrivacyMode(profile.privacy_mode);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user || !profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        document: document.trim() || null,
        currency,
        timezone,
        privacy_mode: privacyMode,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      queryClient.invalidateQueries({ queryKey: ["privacy-mode"] });
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e preferências</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Perfil</CardTitle>
          </div>
          <CardDescription>Informações pessoais da sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled className="bg-muted" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                maxLength={20}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CPF/CNPJ</Label>
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="000.000.000-00"
              maxLength={20}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Preferências</CardTitle>
          </div>
          <CardDescription>Moeda e fuso horário</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Moeda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fuso horário</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Privacidade</CardTitle>
          </div>
          <CardDescription>Controle a visibilidade dos seus dados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo privacidade</Label>
              <p className="text-xs text-muted-foreground">
                Oculta valores monetários na tela com asteriscos (****)
              </p>
            </div>
            <Switch checked={privacyMode} onCheckedChange={setPrivacyMode} />
          </div>
        </CardContent>
      </Card>

      <TwoFactorCard />

      <Separator />

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>

      <Separator />

      <ResetMyDataCard />
    </div>
  );
}
