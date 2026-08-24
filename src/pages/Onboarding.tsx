import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/food/OnboardingShell";
import { StepEmpresa } from "@/components/onboarding/food/StepEmpresa";
import { StepModulos } from "@/components/onboarding/food/StepModulos";
import { StepSucesso } from "@/components/onboarding/food/StepSucesso";
import { isValidCnpj } from "@/lib/cnpj";
import { isValidPhone } from "@/lib/phone";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useOnboardingSubmit, mensagemErroOnboarding } from "@/hooks/useOnboardingSubmit";
import { marcarOnboardingConcluido } from "@/lib/onboardingFinalize";
import { checkOnboardingCnpj, resolveOnboardingByExistingCnpj } from "@/lib/onboardingStatus";

export interface EmpresaFormData {
  nomeCompleto: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  segmentoId: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefoneEmpresa: string;
  whatsappEmpresa: string;
  emailEmpresa: string;
  aceitouLgpd: boolean;
}

const EMPTY_EMPRESA: EmpresaFormData = {
  nomeCompleto: "",
  cnpj: "",
  razaoSocial: "",
  nomeFantasia: "",
  segmentoId: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  telefoneEmpresa: "",
  whatsappEmpresa: "",
  emailEmpresa: "",
  aceitouLgpd: false,
};

function validateEmpresa(d: EmpresaFormData): Partial<Record<keyof EmpresaFormData, string>> {
  const e: Partial<Record<keyof EmpresaFormData, string>> = {};
  if (!d.nomeCompleto.trim()) e.nomeCompleto = "Informe seu nome completo.";
  if (!d.cnpj.trim()) e.cnpj = "Informe o CNPJ.";
  else if (!isValidCnpj(d.cnpj)) e.cnpj = "CNPJ inválido.";
  if (!d.razaoSocial.trim()) e.razaoSocial = "Informe a Razão Social.";
  if (!d.segmentoId) e.segmentoId = "Selecione o segmento.";
  if (!d.cep.trim()) e.cep = "Informe o CEP.";
  if (!d.logradouro.trim()) e.logradouro = "Informe o logradouro.";
  if (!d.numero.trim()) e.numero = "Informe o número.";
  if (!d.bairro.trim()) e.bairro = "Informe o bairro.";
  if (!d.cidade.trim()) e.cidade = "Informe a cidade.";
  if (!d.uf.trim() || d.uf.length !== 2) e.uf = "UF inválida.";
  if (!d.whatsappEmpresa.trim()) e.whatsappEmpresa = "Informe o WhatsApp.";
  else if (!isValidPhone(d.whatsappEmpresa)) e.whatsappEmpresa = "WhatsApp inválido.";
  if (d.telefoneEmpresa && !isValidPhone(d.telefoneEmpresa)) e.telefoneEmpresa = "Telefone inválido.";
  if (!d.emailEmpresa.trim()) e.emailEmpresa = "Informe o e-mail.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.emailEmpresa)) e.emailEmpresa = "E-mail inválido.";
  if (!d.aceitouLgpd) e.aceitouLgpd = "Você precisa aceitar os Termos e a Política de Privacidade.";
  return e;
}

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setContext } = useCompanyContext();
  const submit = useOnboardingSubmit();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [empresa, setEmpresa] = useState<EmpresaFormData>(EMPTY_EMPRESA);
  const [modulos, setModulos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof EmpresaFormData, string>>>({});
  const [cnpjPending, setCnpjPending] = useState(false);
  const [cnpjChecking, setCnpjChecking] = useState(false);
  const [cnpjInactive, setCnpjInactive] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [result, setResult] = useState<{ company_id: string; trial_termina_em: string } | null>(null);

  // Prefill nome/email do usuário logado
  useEffect(() => {
    if (!user) return;
    setEmpresa((d) => ({
      ...d,
      nomeCompleto: d.nomeCompleto || (user.user_metadata?.full_name as string) || "",
      emailEmpresa: d.emailEmpresa || user.email || "",
    }));
  }, [user]);

  const updateEmpresa = (patch: Partial<EmpresaFormData>) => {
    setEmpresa((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof EmpresaFormData)[]) delete next[k];
      return next;
    });
  };

  const updateEmpresaWithCnpjReset = (patch: Partial<EmpresaFormData>) => {
    updateEmpresa(patch);
    if (Object.prototype.hasOwnProperty.call(patch, "cnpj")) {
      setErrors((current) => ({ ...current, cnpj: undefined }));
    }
  };

  const toggleModulo = (slug: string) => {
    setModulos((m) => (m.includes(slug) ? m.filter((s) => s !== slug) : [...m, slug]));
  };

  const handleAvancar = async () => {
    if (cnpjPending) {
      toast.error("Aguarde a consulta do CNPJ finalizar.");
      return;
    }
    const e = validateEmpresa(empresa);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    if (!user) {
      toast.error("Sua sessão expirou. Faça login novamente.");
      return;
    }

    setCnpjChecking(true);
    try {
      const status = await checkOnboardingCnpj(empresa.cnpj);
      if (status.status === "accessible") {
        await marcarOnboardingConcluido(user.id);
        setContext("pj", status.companyId);
        toast.success("Empresa já vinculada. Acessando painel.");
        navigate("/hub", { replace: true });
        return;
      }
      if (status.status === "registered") {
        setErrors((current) => ({
          ...current,
          cnpj: "Este CNPJ já está cadastrado. Entre com a conta responsável ou solicite um convite.",
        }));
        toast.error("Este CNPJ já está cadastrado na plataforma.");
        return;
      }
      setStep(2);
    } catch {
      toast.error("Não foi possível verificar o CNPJ. Tente novamente em instantes.");
    } finally {
      setCnpjChecking(false);
    }
  };

  const handleConcluir = async () => {
    if (modulos.length === 0) {
      toast.error("Selecione pelo menos 1 módulo.");
      return;
    }
    try {
      const res = await submit.mutateAsync({
        nomeCompleto: empresa.nomeCompleto,
        emailCliente: empresa.emailEmpresa,
        telefoneCliente: empresa.telefoneEmpresa,
        whatsappCliente: empresa.whatsappEmpresa,
        cnpj: empresa.cnpj,
        razaoSocial: empresa.razaoSocial,
        nomeFantasia: empresa.nomeFantasia,
        segmentoId: empresa.segmentoId,
        cep: empresa.cep,
        logradouro: empresa.logradouro,
        numero: empresa.numero,
        complemento: empresa.complemento,
        bairro: empresa.bairro,
        cidade: empresa.cidade,
        uf: empresa.uf,
        telefoneEmpresa: empresa.telefoneEmpresa,
        whatsappEmpresa: empresa.whatsappEmpresa,
        emailEmpresa: empresa.emailEmpresa,
        modulosSlugs: modulos,
      });

      // Marca onboarding concluído no profile
      if (user) {
        await marcarOnboardingConcluido(user.id);
      }

      setResult(res);
      setStep(3);
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      if (code === "empresa_ja_cadastrada" && user) {
        const existing = await resolveOnboardingByExistingCnpj(user.id, empresa.cnpj);
        if (existing.completed && existing.companyId) {
          setContext("pj", existing.companyId);
          toast.success("Empresa já vinculada. Acessando painel.");
          navigate("/hub", { replace: true });
          return;
        }
      }
      toast.error(mensagemErroOnboarding(code));
    }
  };

  const handleAcessarPainel = () => {
    if (result?.company_id) {
      setContext("pj", result.company_id);
    }
    navigate("/");
  };

  const requestExit = () => {
    if (step === 3) return navigate("/");
    setExitOpen(true);
  };

  return (
    <>
      <OnboardingShell currentStep={step}>
        {step === 1 && (
          <>
            <StepEmpresa
              data={empresa}
              update={updateEmpresaWithCnpjReset}
              errors={errors}
              setCnpjPending={setCnpjPending}
              cnpjInactive={cnpjInactive}
              setCnpjInactive={setCnpjInactive}
            />
            <div className="mt-6 md:mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
              <Button variant="ghost" onClick={requestExit} className="w-full sm:w-auto min-h-10">
                Sair
              </Button>
              <Button onClick={handleAvancar} disabled={cnpjPending || cnpjChecking} size="lg" className="w-full sm:w-auto min-h-11">
                {cnpjChecking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando…
                  </>
                ) : (
                  <>
                    Avançar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepModulos selectedSlugs={modulos} onToggle={toggleModulo} />
            <div className="mt-6 md:mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={submit.isPending} className="w-full sm:w-auto min-h-10">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button
                onClick={handleConcluir}
                disabled={modulos.length === 0 || submit.isPending}
                size="lg"
                className="w-full sm:w-auto min-h-11"
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Concluindo…
                  </>
                ) : (
                  <>Concluir Cadastro e Iniciar Teste Grátis</>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 3 && result && (
          <StepSucesso
            nomeFantasia={empresa.nomeFantasia}
            razaoSocial={empresa.razaoSocial}
            modulosSlugs={modulos}
            trialTerminaEm={result.trial_termina_em}
            onContinuar={handleAcessarPainel}
          />
        )}
      </OnboardingShell>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja sair do cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados preenchidos serão perdidos e você precisará reiniciar o wizard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar cadastro</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/")}>Sair mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
