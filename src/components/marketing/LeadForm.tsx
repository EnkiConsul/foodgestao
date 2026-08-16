import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";
import { maskPhone } from "@/lib/phone";
import { BUSINESS_TYPES, HEADCOUNT_OPTIONS, INTEREST_OPTIONS } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

type Errors = Record<string, string>;

const initialState = {
  name: "",
  email: "",
  whatsapp: "",
  company_name: "",
  cnpj_count: "1",
  unit_count: "1",
  business_type: "",
  interest: "",
  headcount_range: "",
  message: "",
};

export function LeadForm({ defaultInterest }: { defaultInterest?: "financeiro" | "dp" | "ambos" }) {
  const [form, setForm] = useState({ ...initialState, interest: defaultInterest ?? "" });
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const location = useLocation();

  useEffect(() => {
    trackEvent("form_view", { form: "lead", pagina: location.pathname });
  }, [location.pathname]);

  const set = (key: keyof typeof initialState) => (value: string) => {
    if (!startedRef.current) {
      startedRef.current = true;
      trackEvent("form_start", { form: "lead", pagina: location.pathname });
    }
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  function validate(): Errors {
    const next: Errors = {};
    if (form.name.trim().length < 3) next.name = "Informe seu nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = "Informe um e-mail válido.";
    if (form.whatsapp.replace(/\D/g, "").length < 10) next.whatsapp = "Informe o WhatsApp com DDD.";
    if (!form.company_name.trim()) next.company_name = "Informe o nome da empresa.";
    if (!form.business_type) next.business_type = "Selecione o tipo de negócio.";
    if (!form.interest) next.interest = "Selecione a solução de interesse.";
    if (!consent) next.consent = "É necessário aceitar a Política de Privacidade.";
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      trackEvent("form_validation_error", { form: "lead", campos: Object.keys(found).join(",") });
      const first = document.getElementById(`lead-${Object.keys(found)[0]}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      (first as HTMLInputElement | null)?.focus?.();
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("mkt-lead", {
        body: {
          ...form,
          cnpj_count: Number(form.cnpj_count) || null,
          unit_count: Number(form.unit_count) || null,
          consent,
          website: honeypot,
          source_page: location.pathname,
          utm: getUtm(),
        },
      });
      if (error || (data && (data as { error?: string }).error)) {
        throw new Error((data as { error?: string })?.error || "Não foi possível enviar agora.");
      }
      setDone(true);
      trackEvent("generate_lead", { form: "lead", solucao: form.interest, pagina: location.pathname });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Não foi possível enviar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-site-lg border border-site-line bg-card p-8 text-center text-site-ink shadow-site-card">
        <CheckCircle2 className="mx-auto h-11 w-11 text-site-success" />
        <h3 className="mt-4 text-xl font-extrabold text-site-ink">Recebemos seu contato!</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-site-muted">
          Nosso time vai falar com você pelo WhatsApp ou e-mail informado para entender sua operação e apresentar a
          solução mais adequada. Enquanto isso, você pode conhecer os detalhes de cada módulo.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/financeiro">Ver o Financeiro 360°</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/departamento-pessoal">Ver o módulo Pessoas 360°</Link>
          </Button>
        </div>
      </div>
    );
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`lead-${key}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-destructive">
        {errors[key]}
      </p>
    ) : null;

  const inputClass = (key: string) => cn(errors[key] && "border-destructive focus-visible:ring-destructive");

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-site-lg border border-site-line bg-card p-6 text-site-ink shadow-site-card sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="lead-name" className="text-site-ink">Nome *</Label>
          <Input
            id="lead-name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "lead-name-error" : undefined}
            className={inputClass("name")}
          />
          {fieldError("name")}
        </div>

        <div>
          <Label htmlFor="lead-email" className="text-site-ink">E-mail corporativo *</Label>
          <Input
            id="lead-email"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "lead-email-error" : undefined}
            className={inputClass("email")}
          />
          {fieldError("email")}
        </div>

        <div>
          <Label htmlFor="lead-whatsapp" className="text-site-ink">WhatsApp com DDD *</Label>
          <Input
            id="lead-whatsapp"
            inputMode="tel"
            placeholder="(11) 99999-9999"
            value={form.whatsapp}
            onChange={(e) => set("whatsapp")(maskPhone(e.target.value))}
            autoComplete="tel"
            aria-invalid={!!errors.whatsapp}
            aria-describedby={errors.whatsapp ? "lead-whatsapp-error" : undefined}
            className={inputClass("whatsapp")}
          />
          {fieldError("whatsapp")}
        </div>

        <div>
          <Label htmlFor="lead-company_name" className="text-site-ink">Nome da empresa *</Label>
          <Input
            id="lead-company_name"
            value={form.company_name}
            onChange={(e) => set("company_name")(e.target.value)}
            autoComplete="organization"
            aria-invalid={!!errors.company_name}
            aria-describedby={errors.company_name ? "lead-company_name-error" : undefined}
            className={inputClass("company_name")}
          />
          {fieldError("company_name")}
        </div>

        <div>
          <Label htmlFor="lead-business_type" className="text-site-ink">Tipo de negócio *</Label>
          <Select value={form.business_type} onValueChange={set("business_type")}>
            <SelectTrigger id="lead-business_type" className={inputClass("business_type")} aria-invalid={!!errors.business_type}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("business_type")}
        </div>

        <div>
          <Label htmlFor="lead-cnpj_count" className="text-site-ink">Quantidade de CNPJs</Label>
          <Input
            id="lead-cnpj_count"
            type="number"
            min={1}
            max={999}
            value={form.cnpj_count}
            onChange={(e) => set("cnpj_count")(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="lead-unit_count" className="text-site-ink">Quantidade de unidades</Label>
          <Input
            id="lead-unit_count"
            type="number"
            min={1}
            max={999}
            value={form.unit_count}
            onChange={(e) => set("unit_count")(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="lead-interest" className="text-site-ink">Solução de interesse *</Label>
          <Select value={form.interest} onValueChange={set("interest")}>
            <SelectTrigger id="lead-interest" className={inputClass("interest")} aria-invalid={!!errors.interest}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("interest")}
        </div>

        <div>
          <Label htmlFor="lead-headcount_range" className="text-site-ink">Faixa de colaboradores (opcional)</Label>
          <Select value={form.headcount_range} onValueChange={set("headcount_range")}>
            <SelectTrigger id="lead-headcount_range">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {HEADCOUNT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="lead-message" className="text-site-ink">Mensagem (opcional)</Label>
          <Textarea
            id="lead-message"
            rows={4}
            value={form.message}
            onChange={(e) => set("message")(e.target.value)}
            placeholder="Conte rapidamente como sua gestão funciona hoje."
          />
        </div>

        {/* Honeypot antispam — invisível para pessoas */}
        <div className="hidden" aria-hidden>
          <label htmlFor="lead-website">Site</label>
          <input
            id="lead-website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="lead-consent"
              checked={consent}
              onCheckedChange={(value) => {
                setConsent(value === true);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.consent;
                  return next;
                });
              }}
              aria-invalid={!!errors.consent}
              className="mt-0.5"
            />
            <Label htmlFor="lead-consent" className="text-xs font-normal leading-relaxed text-site-muted">
              Autorizo o contato do 360°FOOD e o tratamento dos meus dados conforme a{" "}
              <Link to="/politica-de-privacidade" className="font-semibold text-site-orange underline">
                Política de Privacidade
              </Link>
              . *
            </Label>
          </div>
          {fieldError("consent")}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-5 rounded-site-md border border-destructive/30 bg-destructive/8 p-3 text-sm font-semibold text-destructive">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="mt-6 h-12 w-full bg-site-orange text-base font-bold text-site-orange-foreground hover:bg-site-orange/90"
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Quero conhecer o 360°FOOD
      </Button>
      <p className="mt-3 text-center text-xs text-site-muted">
        Não pedimos CNPJ nem dados de pagamento neste primeiro contato.
      </p>
    </form>
  );
}
