/**
 * O colaborador define a própria senha do portal.
 *
 * Chamada pública (sem sessão): a identidade autorizada vem do próprio registro
 * do link de uso único — nunca de um id enviado pelo navegador e nunca de uma
 * busca por CPF. O CPF serve apenas como confirmação de que quem está na tela é
 * o colaborador daquele link. O gestor não define nem conhece a senha.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { clientIp, ipRateLimited, isRateLimited, sha256Hex } from "../_shared/rate-limit.ts";
import { avaliarSenha, SENHA_MIN } from "../_shared/password-policy.ts";
import {
  TERMO_PORTAL_MODELO,
  TERMO_PORTAL_VERSAO,
  termoPortalConteudo,
} from "../_shared/termo-portal.ts";
import {
  confirmarToken,
  liberarToken,
  mensagemSituacao,
  registrarEvento,
  reservarToken,
  situacaoAcesso,
  type Purpose,
} from "../_shared/portal-access.ts";

const MAX_POR_IP = 20;
const MAX_POR_TOKEN = 8;

// Regra única de senha nova (S3), espelhada de src/lib/security/passwordPolicy.ts
function senhaForte(s: string): boolean {
  return avaliarSenha(s).valida;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const admin = serviceClient();
    // As duas bibliotecas do cliente têm tipos próprios; aqui é o mesmo objeto.
    const limiter = admin as unknown as Parameters<typeof ipRateLimited>[0];

    // Limite persistente (compartilhado entre instâncias), por IP e por link.
    if (await ipRateLimited(limiter, req, "dp_definir_senha", MAX_POR_IP)) {
      return jsonError(req, "rate_limited");
    }

    const body = await req.json().catch(() => ({}));
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    const tokenId = String(body?.token_id ?? "").trim();
    const codigo = String(body?.codigo ?? "").trim().toUpperCase();
    const purposeBruto = String(body?.purpose ?? "");
    const novaSenha = typeof body?.nova_senha === "string" ? body.nova_senha : "";
    const termoAceito = body?.termo_aceito === true;
    const termoVersao = String(body?.termo_versao ?? "").trim();

    if (purposeBruto !== "activation" && purposeBruto !== "reset") {
      return jsonError(req, "invalid_input", "finalidade inválida");
    }
    const purpose = purposeBruto as Purpose;

    if (cpf.length !== 11 || !tokenId || codigo.length < 8) {
      return jsonError(req, "invalid_input", "payload incompleto");
    }
    // Ativação só conclui com o termo de primeiro acesso aceito na versão
    // vigente: a tela pode estar velha em cache, e aí é melhor recarregar.
    if (purpose === "activation") {
      if (!termoAceito) {
        return jsonResponse(req, 400, {
          code: "termo_obrigatorio",
          error: "É preciso marcar que você leu e concorda com o termo de primeiro acesso.",
        });
      }
      if (termoVersao !== TERMO_PORTAL_VERSAO) {
        return jsonResponse(req, 409, {
          code: "termo_desatualizado",
          error: "O termo foi atualizado. Recarregue a página para ler a versão atual.",
        });
      }
    }
    if (!senhaForte(novaSenha)) {
      return jsonResponse(req, 400, {
        error:
          avaliarSenha(novaSenha).mensagem ??
          `A senha precisa ter ao menos ${SENHA_MIN} caracteres, com maiúscula, minúscula, número e um símbolo.`,
      });
    }

    const chaveToken = await sha256Hex(`dp_definir_senha:token:${tokenId}`);
    if (await isRateLimited(limiter, "dp_definir_senha_token", chaveToken, MAX_POR_TOKEN)) {
      return jsonError(req, "rate_limited");
    }

    // 1) Reserva exclusiva do link, já conferindo hash, prazo e finalidade.
    const token = await reservarToken(admin, tokenId, codigo, purpose);
    if (!token) {
      // Link já consumido com sucesso merece aviso próprio: a senha já foi
      // criada e a pessoa só precisa entrar — não pedir outro link.
      const { data: anterior } = await admin
        .from("dp_portal_access_tokens")
        .select("consumed_at, purpose")
        .eq("id", tokenId)
        .maybeSingle();
      if (anterior?.consumed_at && anterior.purpose === purpose) {
        return jsonResponse(req, 409, {
          code: "token_usado",
          error:
            "Este link já foi utilizado e sua senha já foi criada. Entre com seu CPF e a senha cadastrada.",
        });
      }
      return jsonResponse(req, 400, { error: "Link inválido, expirado ou já utilizado." });
    }

    // 2) O CPF informado tem que ser o do colaborador desse link.
    const { data: colab, error: colabErr } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, company_id")
      .eq("id", token.colaborador_id)
      .maybeSingle();
    if (colabErr) {
      await liberarToken(admin, token.id);
      return jsonError(req, "internal", "falha ao validar o cadastro");
    }
    const cpfCadastro = String(colab?.cpf ?? "").replace(/\D/g, "");
    if (
      !colab ||
      colab.user_id !== token.user_id ||
      colab.company_id !== token.company_id ||
      cpfCadastro !== cpf
    ) {
      await liberarToken(admin, token.id);
      return jsonResponse(req, 400, { error: "Link inválido, expirado ou já utilizado." });
    }

    // 3) Situação atual manda: acesso bloqueado, cadastro removido, empresa
    // inativa ou prazo de consulta vencido derrubam o link, mesmo que ele tenha
    // sido criado antes. Criar senha nunca desfaz um bloqueio.
    const situacao = await situacaoAcesso(admin, token.colaborador_id);
    const impedimento = mensagemSituacao(situacao);
    if (impedimento) {
      await confirmarToken(admin, token.id);
      return jsonResponse(req, 403, { code: situacao, error: impedimento });
    }

    // 4) Troca a senha; se falhar, o link volta a valer.
    const { error: updErr } = await admin.auth.admin.updateUserById(token.user_id, {
      password: novaSenha,
    });
    if (updErr) {
      await liberarToken(admin, token.id);
      return jsonResponse(req, 400, {
        error: "Não foi possível salvar essa senha. Tente outra combinação.",
      });
    }

    // 5) Só agora o link é definitivamente queimado.
    await confirmarToken(admin, token.id);

    // O bloqueio nunca é removido aqui: só o DP reativa, de forma explícita.
    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: token.user_id,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
        password_changed_by: token.user_id,
      },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-definir-senha] security_state:", secErr.message);

    // 6) Aceite do termo de primeiro acesso: lastro das assinaturas seguintes.
    // A impressão digital vem da cópia do servidor, nunca do texto do navegador.
    // Índice único por colaborador e versão: reenvio não duplica o registro.
    if (purpose === "activation") {
      const { error: termoErr } = await admin.from("dp_documento_aceites").insert({
        company_id: token.company_id,
        colaborador_id: token.colaborador_id,
        modelo: TERMO_PORTAL_MODELO,
        modelo_versao: TERMO_PORTAL_VERSAO,
        conteudo_hash: await sha256Hex(termoPortalConteudo()),
        hash_origem: "sha256_conteudo",
        aceito_por: token.user_id,
        ip: clientIp(req),
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
        documento_snapshot: {
          titulo: TERMO_PORTAL_TITULO,
          versao: TERMO_PORTAL_VERSAO,
          paragrafos: TERMO_PORTAL_PARAGRAFOS,
        },
      });
      // Duplicidade (23505) é resultado esperado em reenvio: segue em frente.
      if (termoErr && termoErr.code !== "23505") {
        console.error("[dp-definir-senha] termo_portal:", termoErr.message);
      }
    }

    await registrarEvento(
      admin,
      purpose === "activation" ? "access_activated" : "password_reset_completed",
      {
        actorUserId: token.user_id,
        targetUserId: token.user_id,
        companyId: token.company_id,
        colaboradorId: token.colaborador_id,
      },
    );

    return jsonResponse(req, 200, { success: true });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
