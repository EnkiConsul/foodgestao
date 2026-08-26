import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingSubmitPayload {
  nomeCompleto: string;
  emailCliente: string;
  telefoneCliente: string;
  whatsappCliente: string;
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
  modulosSlugs: string[];
}

export interface OnboardingSubmitResult {
  company_id: string;
  trial_termina_em: string;
}

const digits = (v: string) => (v ?? "").replace(/\D/g, "");

export function useOnboardingSubmit() {
  return useMutation<OnboardingSubmitResult, Error & { code?: string }, OnboardingSubmitPayload>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.rpc("fn_cadastrar_empresa_onboarding" as any, {
        p_nome_completo: payload.nomeCompleto,
        p_email_cliente: payload.emailCliente,
        p_telefone_cliente: digits(payload.telefoneCliente),
        p_whatsapp_cliente: digits(payload.whatsappCliente),
        p_cnpj: digits(payload.cnpj),
        p_razao_social: payload.razaoSocial,
        p_nome_fantasia: payload.nomeFantasia || null,
        p_segmento_id: payload.segmentoId,
        p_cep: digits(payload.cep),
        p_logradouro: payload.logradouro,
        p_numero: payload.numero,
        p_complemento: payload.complemento || null,
        p_bairro: payload.bairro,
        p_cidade: payload.cidade,
        p_uf: payload.uf,
        p_telefone_empresa: digits(payload.telefoneEmpresa),
        p_whatsapp_empresa: digits(payload.whatsappEmpresa),
        p_email_empresa: payload.emailEmpresa,
        p_modulos_slugs: payload.modulosSlugs,
      });

      if (error) {
        const raw = [error.message, error.details, error.code].filter(Boolean).join(" ");
        let code = "erro_desconhecido";
        if (raw.includes("empresa_ja_cadastrada")) code = "empresa_ja_cadastrada";
        else if (raw.includes("nenhum_modulo_selecionado")) code = "nenhum_modulo_selecionado";
        else if (raw.includes("cnpj_invalido")) code = "cnpj_invalido";
        else if (raw.includes("usuario_nao_autenticado")) code = "usuario_nao_autenticado";
        else if (raw.toLowerCase().includes("sem permiss")) code = "sem_permissao";
        else if (raw.includes("23505") || raw.includes("duplicate key")) code = "cadastro_duplicado";
        if (code === "erro_desconhecido") {
          console.error("[onboarding] falha inesperada na RPC fn_cadastrar_empresa_onboarding", {
            message: error.message,
            details: error.details,
            hint: (error as { hint?: string }).hint,
            code: error.code,
          });
        }
        const err = new Error(raw) as Error & { code?: string };
        err.code = code;
        throw err;
      }


      return data as OnboardingSubmitResult;
    },
  });
}

export function mensagemErroOnboarding(code?: string): string {
  switch (code) {
    case "empresa_ja_cadastrada":
      return "Este CNPJ já está cadastrado na plataforma. Faça login com a conta responsável.";
    case "nenhum_modulo_selecionado":
      return "Selecione pelo menos um módulo para continuar.";
    case "cnpj_invalido":
      return "CNPJ inválido. Verifique o número informado.";
    case "usuario_nao_autenticado":
      return "Sua sessão expirou. Faça login novamente.";
    case "cadastro_duplicado":
      return "Já existe um cadastro em andamento para esses dados. Recarregue a página e tente novamente.";
    case "sem_permissao":
      return "Sua conta não tinha permissão para concluir esta etapa. Recarregue a página e tente novamente.";
    default:
      return "Não foi possível concluir o cadastro. Tente novamente em instantes.";
  }
}
