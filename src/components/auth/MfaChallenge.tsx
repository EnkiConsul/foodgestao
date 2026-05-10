import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { TotpCountdown } from "./TotpCountdown";

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MfaChallenge({ onSuccess, onCancel }: Props) {
  const { signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        toast.error("Erro ao carregar fatores", { description: error.message });
        onCancel();
        return;
      }
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      if (!totp) {
        // No factor – nothing to challenge
        onSuccess();
        return;
      }
      setFactorId(totp.id);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (chErr || !ch) {
        toast.error("Erro no desafio MFA", { description: chErr?.message });
        onCancel();
        return;
      }
      setChallengeId(ch.id);
      setLoading(false);
    })();
  }, [onCancel, onSuccess]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    setSubmitting(false);
    if (error) {
      toast.error("Código inválido", { description: error.message });
      return;
    }
    onSuccess();
  };

  const cancel = async () => {
    await signOut();
    onCancel();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparando verificação...
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Insira o código de 6 dígitos do seu app autenticador.
      </div>
      <div className="space-y-2">
        <Label htmlFor="mfa-code">Código de verificação</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" onClick={cancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || code.length !== 6}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Verificar
        </Button>
      </div>
    </form>
  );
}
