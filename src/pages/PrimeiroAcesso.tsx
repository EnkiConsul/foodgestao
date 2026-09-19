import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { avaliarSenha, mensagemDoServidorDeContas } from "@/lib/security/passwordPolicy";
import { MedidorSenha } from "@/components/auth/MedidorSenha";

/** Regra única de senha nova (S3): src/lib/security/passwordPolicy.ts */
const schema = z.object({
  password: z.string().max(200),
  confirm: z.string(),
}).superRefine((d, ctx) => {
  const av = avaliarSenha(d.password);
  if (!av.valida) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: av.mensagem as string });
  }
}).refine((d) => d.password === d.confirm, {
  message: "As senhas não coincidem",
  path: ["confirm"],
});

export default function PrimeiroAcesso() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;
      if (!data.session) {
        navigate("/auth", { replace: true });
        return;
      }
      // Se a senha já foi trocada, esta tela não deve aparecer de novo.
      const { data: estado } = await supabase
        .from("auth_user_security_state")
        .select("must_change_password")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (ativo && estado && estado.must_change_password === false) {
        navigate("/", { replace: true });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.errors.forEach((err) => { if (err.path[0]) fe[err.path[0] as string] = err.message; });
      setErrors(fe);
      return;
    }
    setSubmitting(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        const texto = mensagemDoServidorDeContas(updErr.message ?? "");
        setErrors({ password: texto });
        toast.error("Não foi possível salvar a senha", { description: texto });
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        // Marca a troca; se falhar, o acesso continua — não trava a pessoa aqui.
        const { error: estadoErr } = await supabase
          .from("auth_user_security_state")
          .upsert(
            {
              user_id: userRes.user.id,
              must_change_password: false,
              password_changed_at: new Date().toISOString(),
              password_changed_by: userRes.user.id,
            },
            { onConflict: "user_id" },
          );
        if (estadoErr) console.warn("[primeiro-acesso] estado de senha:", estadoErr.message);
      }
      toast.success("Senha atualizada!", { description: "Você já pode continuar." });
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Helmet><title>Primeiro acesso — Aveto 360</title></Helmet>
      <div className="w-full max-w-md space-y-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </Link>
        <Card className="w-full shadow-lg">
        <CardHeader className="text-center space-y-3">
          <CardTitle className="text-2xl font-bold">Defina sua senha</CardTitle>
          <CardDescription>
            Este é seu primeiro acesso. Escolha uma senha pessoal — a senha provisória não poderá mais ser usada.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  maxLength={72}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <MedidorSenha senha={password} />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              <p className="text-xs text-muted-foreground">
                Pelo menos 8 caracteres, com maiúscula, minúscula, número e um símbolo (ex.: Ale!2026).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type={showPwd ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="pl-10"
                  maxLength={72}
                  autoComplete="new-password"
                />
              </div>
              {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
            </div>
            <Button type="submit" className="w-full min-h-11" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar Nova Senha"}
            </Button>
          </CardContent>
        </form>
        </Card>
      </div>
    </div>
  );
}
