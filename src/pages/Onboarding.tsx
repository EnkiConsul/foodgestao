import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { StepProfileType } from "@/components/onboarding/StepProfileType";
import { StepProfileData } from "@/components/onboarding/StepProfileData";
import { StepAccount } from "@/components/onboarding/StepAccount";
import { StepCategories } from "@/components/onboarding/StepCategories";
import { ChevronLeft, ChevronRight, SkipForward } from "lucide-react";

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

const STEPS = ["Tipo de Perfil", "Seus Dados", "Conta Financeira", "Categorias"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<OnboardingData>({
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
  });

  const update = (partial: Partial<OnboardingData>) => setData((d) => ({ ...d, ...partial }));

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Update profile
      await supabase.from("profiles").update({
        profile_type: data.profileType as any,
        full_name: data.fullName || undefined,
        phone: data.phone || undefined,
        document: data.document || undefined,
        onboarding_completed: true,
      }).eq("user_id", user.id);

      // Create company if PJ
      if (["mei", "microempresa", "hibrido"].includes(data.profileType) && data.companyName) {
        await supabase.from("companies").insert({
          user_id: user.id,
          name: data.companyName,
          cnpj: data.companyCnpj || undefined,
        });
      }

      // Create account
      const balance = parseFloat(data.initialBalance.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
      await supabase.from("accounts").insert({
        user_id: user.id,
        name: data.accountName || "Conta Principal",
        account_type: data.accountType as any,
        initial_balance: balance,
        current_balance: balance,
        context: ["mei", "microempresa"].includes(data.profileType) ? "pj" : "pf",
      });

      // Create selected categories
      if (data.selectedCategories.length > 0) {
        const categories = data.selectedCategories.map((name) => ({
          user_id: user.id,
          name,
          transaction_type: "despesa" as const,
          is_system: true,
        }));
        await supabase.from("categories").insert(categories);
      }

      toast.success("Tudo pronto!", { description: "Seu perfil foi configurado." });
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

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Configurar sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Etapa {step + 1} de {STEPS.length} — {STEPS[step]}
          </p>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step content */}
        <div className="min-h-[320px]">
          {step === 0 && <StepProfileType data={data} update={update} />}
          {step === 1 && <StepProfileData data={data} update={update} />}
          {step === 2 && <StepAccount data={data} update={update} />}
          {step === 3 && <StepCategories data={data} update={update} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>

          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
            <SkipForward className="h-4 w-4 mr-1" /> Pular
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving}>
              {saving ? "Salvando..." : "Concluir"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
