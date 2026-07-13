import { useState } from "react";
import { z } from "zod";
import { Mail, Loader2, CheckCircle2, Phone, User as UserIcon, Building2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const contactLeadSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(150),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  company: z.string().trim().max(150).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Conte um pouco sobre o que precisa").max(1000),
});

type FormState = z.infer<typeof contactLeadSchema>;

const empty: FormState = { name: "", email: "", phone: "", company: "", message: "" };

export function ContactSection() {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: string) => {
    setForm((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactLeadSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Partial<Record<keyof FormState, string>> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as keyof FormState;
        if (!fe[k]) fe[k] = i.message;
      });
      setErrors(fe);
      return;
    }
    setLoading(true);
    try {
      const idempotencyKey = `contact-lead-${crypto.randomUUID()}`;
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-lead",
          recipientEmail: "comercial@raptorsistemas.com",
          idempotencyKey,
          templateData: parsed.data,
        },
      });
      if (error) throw error;
      setSent(true);
      setForm(empty);
      toast({ title: "Mensagem enviada!", description: "Em breve entraremos em contato." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tente novamente em instantes";
      toast({ title: "Erro ao enviar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contato" className="border-t border-border/60 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Fale com a gente
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Tem interesse no 360°FOOD?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Preencha o formulário e nosso time comercial entrará em contato para tirar dúvidas, montar uma demonstração ou montar um plano sob medida.
          </p>
        </div>

        <Card className="mx-auto mt-8 max-w-2xl border-border/60">
          <CardContent className="p-6 sm:p-8">
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <h3 className="text-lg font-semibold">Recebemos seu contato!</h3>
                <p className="text-sm text-muted-foreground">
                  Em breve nosso time comercial vai te responder no e-mail informado.
                </p>
                <Button variant="outline" onClick={() => setSent(false)} className="mt-2">
                  Enviar outra mensagem
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name" className="flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" /> Nome *
                    </Label>
                    <Input
                      id="contact-name"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="Seu nome"
                      autoComplete="name"
                      disabled={loading}
                      aria-invalid={!!errors.name}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email" className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" /> E-mail *
                    </Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="voce@empresa.com"
                      autoComplete="email"
                      disabled={loading}
                      aria-invalid={!!errors.email}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-phone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Telefone
                    </Label>
                    <Input
                      id="contact-phone"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="(11) 99999-9999"
                      autoComplete="tel"
                      disabled={loading}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-company" className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Empresa
                    </Label>
                    <Input
                      id="contact-company"
                      value={form.company}
                      onChange={(e) => set("company", e.target.value)}
                      placeholder="Nome da empresa (opcional)"
                      autoComplete="organization"
                      disabled={loading}
                    />
                    {errors.company && <p className="text-xs text-destructive">{errors.company}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-message" className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Mensagem *
                  </Label>
                  <Textarea
                    id="contact-message"
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Conte como podemos ajudar..."
                    rows={5}
                    disabled={loading}
                    aria-invalid={!!errors.message}
                  />
                  {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
                </div>
                <div className="flex flex-col-reverse items-center justify-between gap-3 pt-2 sm:flex-row">
                  <p className="text-[11px] text-muted-foreground">
                    Ao enviar, você concorda com nossa{" "}
                    <a href="/privacidade" className="underline hover:text-primary">Política de Privacidade</a>.
                  </p>
                  <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                    ) : (
                      <>Enviar mensagem</>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
