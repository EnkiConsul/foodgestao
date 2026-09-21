/**
 * PRIMEIRO módulo avaliado pela aplicação (primeiro import de `main.tsx`),
 * portanto executado antes de `src/integrations/supabase/client.ts` criar o
 * cliente do banco.
 *
 * Fail-closed: se a combinação de ambiente/banco/chave for incoerente, a
 * aplicação não sobe — mostra o motivo e interrompe o carregamento, em vez de
 * cair silenciosamente em produção.
 */
import { assertAmbienteValido, AmbienteInvalidoError } from "@/lib/env/appEnv";
import { instalarFetchGuardHomologacao } from "@/lib/env/homologacaoFetchGuard";


function telaDeBloqueio(mensagem: string) {
  const alvo = document.getElementById("root");
  if (!alvo) return;
  alvo.innerHTML = "";
  const caixa = document.createElement("div");
  caixa.setAttribute("role", "alert");
  caixa.style.cssText =
    "max-width:640px;margin:15vh auto;padding:24px;border-radius:12px;border:1px solid #d33;font-family:system-ui,sans-serif;line-height:1.5";
  const titulo = document.createElement("h1");
  titulo.textContent = "Configuração de ambiente inválida";
  titulo.style.cssText = "font-size:18px;margin:0 0 12px";
  const texto = document.createElement("p");
  texto.textContent = mensagem;
  texto.style.cssText = "font-size:14px;margin:0";
  caixa.append(titulo, texto);
  alvo.append(caixa);
}

export function validarAmbienteOuBloquear(): void {
  try {
    assertAmbienteValido();
  } catch (erro) {
    const mensagem =
      erro instanceof AmbienteInvalidoError
        ? erro.message
        : "Não foi possível validar o ambiente da aplicação.";
    if (typeof document !== "undefined") telaDeBloqueio(mensagem);
    throw erro;
  }
}

validarAmbienteOuBloquear();

// Guarda de TRANSPORTE: precisa estar no `fetch` antes de qualquer cliente do
// banco ser criado. É aqui que ficam os mocks de consulta, a allowlist de
// funções (default deny) e o bloqueio de e-mails nativos do Auth.
// Em produção não instala nada.
instalarFetchGuardHomologacao();

