import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, IdCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import logoMarinho from "@/assets/360food-logo-marinho.png.asset.json";

function formatCpfMask(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function DpLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate("/dp/meu", { replace: true });
  }, [user, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      setError("Informe um CPF válido (11 dígitos).");
      return;
    }
    if (!password) {
      setError("Informe a senha.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: email, error: rpcErr } = await supabase.rpc("resolve_cpf_login", { _cpf: digits });
      if (rpcErr || !email) {
        setError("CPF ou senha inválidos.");
        setSubmitting(false);
        return;
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email as string,
        password,
      });
      if (signErr) {
        setError("CPF ou senha inválidos.");
        setSubmitting(false);
        return;
      }
      navigate("/dp/meu", { replace: true });
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Helmet><title>Portal do Colaborador — 360°FOOD</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img
            src={logoMarinho.url}
            alt="360°FOOD"
            className="mx-auto h-16 w-auto select-none"
            draggable={false}
          />
          <CardTitle className="sr-only">360°FOOD</CardTitle>
          <CardDescription>Portal do Colaborador — acesse com CPF e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                autoComplete="username"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCpfMask(e.target.value))}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Entrando...</>
              ) : (
                <><KeyRound className="h-4 w-4 mr-2" /> Entrar</>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground pt-2">
              Esqueceu a senha? Solicite ao RH da sua empresa.
            </p>
            <p className="text-xs text-center text-muted-foreground">
              É administrador? <Link to="/auth" className="text-primary hover:underline">Entrar por e-mail</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
