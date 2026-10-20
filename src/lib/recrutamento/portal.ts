import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";

export interface PortalVaga {
  codigo: string; titulo: string; quantidade: number; unidade: string | null;
  cidade: string | null; bairro: string | null; tipo_contratacao: string; jornada: string | null;
}
export interface PortalPublico {
  slug: string; empresa: string; apresentacao: string | null; regiao: string | null;
  logo_url: string | null; vagas: PortalVaga[];
}
export interface TalentoStatus {
  tem_perfil: boolean; perfil_completo?: boolean; avaliacao_valida?: boolean;
  vinculo?: "ativo" | "retirado" | null; autorizado_em?: string | null; banco_geral?: boolean; texto_versao?: number;
}
export interface Participacao {
  id: string; empresa: string; slug: string | null; estado: "ativo" | "retirado";
  autorizado_em: string; retirado_em: string | null;
}

export const SEM_VAGAS_TEXTO =
  "Não temos vagas abertas no momento, mas você pode cadastrar seu perfil em nosso Banco de Talentos para futuras oportunidades.";

/** Link permanente do portal (sempre o domínio oficial, nunca o endereço de pré-visualização). */
export function urlPortal(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/carreiras/${slug}`;
}

export type EtapaTalento = "login" | "perfil" | "avaliacao" | "autorizar" | "concluido";

/** Próximo passo do candidato para entrar no Banco de Talentos. */
export function proximaEtapa(logado: boolean, s: TalentoStatus | null | undefined): EtapaTalento {
  if (!logado) return "login";
  if (!s?.tem_perfil || !s.perfil_completo) return "perfil";
  if (!s.avaliacao_valida) return "avaliacao";
  if (s.vinculo === "ativo") return "concluido";
  return "autorizar";
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(nome, args ?? {});
  if (error) throw new Error(error.message || "Não foi possível concluir. Tente novamente.");
  return data as T;
}

export const portalPublico = (slug: string) => rpc<PortalPublico | null>("recrutamento_portal_publico", { _slug: slug });
export const talentoStatus = (slug: string) => rpc<TalentoStatus>("recrutamento_talento_status", { _slug: slug });
export const talentoEntrar = (slug: string, bancoGeral: boolean) =>
  rpc<{ resultado: "ativado" | "ja_ativo" }>("recrutamento_talento_entrar", { _slug: slug, _banco_geral: bancoGeral });
export const talentoRetirar = (id: string) => rpc<void>("recrutamento_talento_retirar", { _talento_id: id });
export const bancoGeralDefinir = (ativo: boolean) => rpc<void>("recrutamento_banco_geral_definir", { _ativo: ativo });
export const minhasParticipacoes = () => rpc<Participacao[]>("recrutamento_minhas_participacoes");
