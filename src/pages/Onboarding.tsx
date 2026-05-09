import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { StepProfileType } from "@/components/onboarding/StepProfileType";
import { StepProfileData } from "@/components/onboarding/StepProfileData";
import { StepAccount } from "@/components/onboarding/StepAccount";
import { StepCategories } from "@/components/onboarding/StepCategories";
import { CheckCircle2, Circle, Rocket, SkipForward, TreePine } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidCnpj } from "@/lib/cnpj";
import { isValidCpf } from "@/lib/cpf";

export type OnboardingData = {
  profileType: string;
  fullName: string;
  document: string;
  phone: string;
  companyName: string;
  companyCnpj: string;
  accountName: string;
  accountType: string;
  initialBalance: string;
  selectedCategories: string[];
};

type StepKey = "profile" | "data" | "account" | "categories";

const STEPS: { key: StepKey; title: string; description: string }[] = [
  { key: "profile", title: "Tipo de perfil", description: "Defina se você é PF, MEI, Microempresa ou Híbrido." },
  { key: "data", title: "Seus dados", description: "Nome, documento e telefone (e dados da empresa, se PJ)." },
  { key: "account", title: "Primeira conta financeira", description: "Cadastre uma conta com saldo inicial." },
  { key: "categories", title: "Categorias iniciais", description: "Escolha categorias para começar a lançar." },
];

const DEFAULT_DATA: OnboardingData = {
  profileType: "pf",
  fullName: "",
  document: "",
  phone: "",
  companyName: "",
  companyCnpj: "",
  accountName: "Conta Principal",
  accountType: "corrente",
  initialBalance: "0",
  selectedCategories: [],
};

const DEFAULT_COMPLETED: Record<StepKey, boolean> = {
  profile: false,
  data: false,
  account: false,
  categories: false,
};

export default function Onboarding() {
  const [completed, setCompleted] = useState<Record<StepKey, boolean>>(DEFAULT_COMPLETED);
  const [openItem, setOpenItem] = useState<string | undefined>("profile");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved progress on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("onboarding_data, full_name, phone, document, profile_type")
      .eq("user_id", user.id)
      .single()
      .then(({ data: profile }) => {
        const saved = (profile?.onboarding_data ?? null) as
          | { data?: Partial<OnboardingData>; completed?: Partial<Record<StepKey, boolean>>; openItem?: string }
          | null;
        setData((d) => ({
          ...d,
          fullName: profile?.full_name ?? d.fullName,
          phone: profile?.phone ?? d.phone,
          document: profile?.document ?? d.document,
          profileType: profile?.profile_type ?? d.profileType,
          ...(saved?.data ?? {}),
        }));
        if (saved?.completed) {
          setCompleted({ ...DEFAULT_COMPLETED, ...saved.completed });
        }
        if (saved?.openItem) setOpenItem(saved.openItem);
        hydratedRef.current = true;
        setLoading(false);
      });
  }, [user]);

  // Debounced autosave
  useEffect(() => {
    if (!user || !hydratedRef.current) return;
    setAutoSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await supabase
        .from("profiles")
        .update({ onboarding_data: { data, completed, openItem } as any })
        .eq("user_id", user.id);
      setAutoSaveStatus("saved");
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data, completed, openItem, user]);

  const update = (partial: Partial<OnboardingData>) => setData((d) => ({ ...d, ...partial }));

  const isPJ = ["mei", "microempresa", "hibrido"].includes(data.profileType);

  const validateStep = (key: StepKey): string | null => {
    switch (key) {
      case "profile":
        return data.profileType ? null : "Selecione um tipo de perfil.";
      case "data":
        if (isPJ) {
          if (!data.companyName.trim()) return "Informe o nome da empresa.";
          if (!data.companyCnpj.trim()) return "Informe o CNPJ.";
          if (!isValidCnpj(data.companyCnpj)) return "CNPJ inválido. Verifique o número informado.";
        }
        if (!isPJ || data.profileType === "hibrido") {
          if (!data.fullName.trim()) return "Informe seu nome completo.";
          if (!data.document.trim()) return "Informe seu CPF.";
          if (!data.phone.trim()) return "Informe seu telefone.";
        }
        return null;
      case "account":
        return data.accountName.trim() ? null : "Informe o nome da conta.";
      case "categories":
        return data.selectedCategories.length > 0 ? null : "Selecione ao menos uma categoria.";
    }
  };

  const handleConfirmStep = (key: StepKey) => {
    const err = validateStep(key);
    if (err) {
      toast.error(err);
      return;
    }
    setCompleted((c) => ({ ...c, [key]: true }));
    const order: StepKey[] = ["profile", "data", "account", "categories"];
    const next = order.find((k) => !{ ...completed, [key]: true }[k]);
    setOpenItem(next);
    toast.success("Etapa concluída!");
  };

  const allDone = Object.values(completed).every(Boolean);
  const completedCount = Object.values(completed).filter(Boolean).length;
  const progress = (completedCount / STEPS.length) * 100;

  const handleFinish = async () => {
    if (!user || !allDone) return;
    setSaving(true);
    try {
      // Cancel any pending debounced autosave and flush a final snapshot first
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setAutoSaveStatus("saving");
      await supabase
        .from("profiles")
        .update({ onboarding_data: { data, completed, openItem } as any })
        .eq("user_id", user.id);
      setAutoSaveStatus("saved");

      // Then mark onboarding as completed and persist final profile fields
      await supabase.from("profiles").update({
        profile_type: data.profileType as any,
        full_name: data.fullName || undefined,
        phone: data.phone || undefined,
        document: data.document || undefined,
        onboarding_completed: true,
      }).eq("user_id", user.id);

      if (isPJ && data.companyName) {
        await supabase.from("companies").insert({
          user_id: user.id,
          name: data.companyName,
          cnpj: data.companyCnpj || undefined,
        });
      }

      const balance = parseFloat(data.initialBalance.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
      await supabase.from("accounts").insert({
        user_id: user.id,
        name: data.accountName || "Conta Principal",
        account_type: data.accountType as any,
        initial_balance: balance,
        current_balance: balance,
        context: ["mei", "microempresa"].includes(data.profileType) ? "pj" : "pf",
      });

      if (data.selectedCategories.length > 0) {
        const categories = data.selectedCategories.map((name) => ({
          user_id: user.id,
          name,
          transaction_type: "despesa" as const,
          is_system: true,
        }));
        await supabase.from("categories").insert(categories);
      }

      toast.success("Tudo pronto!", { description: "Seu painel foi liberado." });
      navigate("/");
    } catch {
      toast.error("Erro ao salvar dados");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
    navigate("/");
    setSaving(false);
  };

  const renderStepContent = (key: StepKey) => {
    switch (key) {
      case "profile":
        return <StepProfileType data={data} update={update} />;
      case "data":
        return <StepProfileData data={data} update={update} />;
      case "account":
        return <StepAccount data={data} update={update} />;
      case "categories":
        return <StepCategories data={data} update={update} />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <TreePine className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Bem-vindo ao Gestor Plin</h1>
              <p className="text-sm text-muted-foreground">
                Conclua o checklist abaixo para liberar seu Dashboard.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground pt-2">
            {autoSaveStatus === "saving" && "Salvando..."}
            {autoSaveStatus === "saved" && "Progresso salvo"}
          </span>
        </div>

        {/* Progress card */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {completedCount} de {STEPS.length} etapas concluídas
              </span>
              <span className="text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>

        {/* Checklist */}
        <Accordion
          type="single"
          collapsible
          value={openItem}
          onValueChange={setOpenItem}
          className="space-y-3"
        >
          {STEPS.map((s, idx) => {
            const done = completed[s.key];
            return (
              <AccordionItem
                key={s.key}
                value={s.key}
                className={cn(
                  "rounded-lg border bg-card px-4 transition-colors",
                  done && "border-primary/40 bg-primary/5"
                )}
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className={cn("text-sm font-semibold", done && "text-primary")}>
                        {idx + 1}. {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="space-y-4">
                    {renderStepContent(s.key)}
                    <div className="flex justify-end">
                      <Button onClick={() => handleConfirmStep(s.key)} size="sm">
                        {done ? "Atualizar etapa" : "Marcar como concluída"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
            <SkipForward className="mr-1 h-4 w-4" /> Pular onboarding
          </Button>
          <Button onClick={handleFinish} disabled={!allDone || saving} size="lg">
            <Rocket className="mr-2 h-4 w-4" />
            {saving ? "Liberando..." : "Liberar Dashboard"}
          </Button>
        </div>
      </div>
    </div>
  );
}
