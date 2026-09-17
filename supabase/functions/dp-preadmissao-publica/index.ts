/**
 * Experiência do candidato (sem login), sempre atrás do convite validado.
 *
 * O candidato só grava os campos da allowlist — payload com campo fora da lista
 * é REJEITADO, não filtrado em silêncio. A empresa vem do convite, nunca do
 * cliente. Depois que a ficha entra em revisão/contabilidade, o candidato não
 * grava mais nada: nem dados, nem pessoas.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import {
  camposNaoPermitidos,
  camposNaoPermitidosPessoas,
  camposNaoPermitidosRaiz,
  candidatoPodeEditar,
  enviarFicha,
  ESTADOS_EDITAVEIS_CANDIDATO,
  filtrarCamposCandidato,
  filtrarPessoasCandidato,
  MOTIVOS_GRAVACAO,
  registrarEvento,
  requisitosEmpresa,
  requisitosPrevistos,
  salvarCandidato,
  transicionar,
  validarConvite,
  validarDadosCandidato,
} from "../_shared/preadmissao.ts";
import { montarChecklist, pendenciasDocumentais } from "../_shared/preadmissao-checklist.ts";

const MOTIVOS: Record<string, string> = {
  nao_encontrado: "Este link não é válido. Peça um novo link à empresa.",
  expirado: "Este link expirou. Peça um novo link à empresa.",
  revogado: "Este link foi cancelado. Peça um novo link à empresa.",
  encerrado: "Este processo já foi encerrado pela empresa.",
};

const FASE_ENCERRADA =
  "Sua ficha já está em análise pela empresa. Aguarde o contato: não é possível alterar os dados agora.";

const OBRIGATORIOS = [
  "nome", "cpf", "data_nascimento", "email", "estado_civil", "nome_mae",
  "grau_instrucao", "telefone", "cep", "endereco", "cidade", "uf",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const admin = serviceClient();
    if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_publica", 300)) {
      return jsonError(req, "rate_limited");
    }

    const body = await req.json().catch(() => ({}));
    const conviteId = String(body?.t ?? "").trim();
    const token = String(body?.c ?? "").trim();
    const acao = String(body?.action ?? "ler").trim();

    const valid = await validarConvite(admin, conviteId, token);
    if (!valid.ok) return jsonResponse(req, 403, { error: MOTIVOS[valid.motivo], motivo: valid.motivo });
    const pa = valid.preadmissao;

    const [{ data: cargo }, { data: unidade }] = await Promise.all([
      pa.cargo_previsto_id
        ? admin.from("dp_cargos").select("nome").eq("id", pa.cargo_previsto_id).maybeSingle()
        : Promise.resolve({ data: null }),
      pa.unidade_prevista_id
        ? admin.from("dp_unidades").select("nome").eq("id", pa.unidade_prevista_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    /** Sempre relê a ficha do banco: nada de responder com estado velho. */
    const carregar = async () => {
      // Requisitos calculados com a ficha recém-lida: cargo/unidade alterados
      // pelo gestor aparecem na hora para o candidato.
      const { data: atual } = await admin
        .from("dp_preadmissoes")
        .select(
          "status, dados, correcao_motivo, data_nascimento, estado_civil, cpf, email, versao, " +
            "cargo_previsto_id, unidade_prevista_id, trabalho_apos_22h",
        )
        .eq("id", pa.id)
        .maybeSingle();
      const fichaAtual = { ...pa, ...((atual ?? {}) as Record<string, unknown>) } as typeof pa;
      const [{ data: pessoas }, { data: docs }, reqs, reqsEmpresa] = await Promise.all([
        admin
          .from("dp_preadmissao_pessoas")
          .select("*")
          .eq("preadmissao_id", pa.id)
          .is("removido_em", null)
          .order("created_at"),
        admin
          .from("dp_preadmissao_documentos")
          .select("id, requisito_codigo, pessoa_id, file_name, status, motivo_recusa, created_at")
          .eq("preadmissao_id", pa.id)
          .is("substituido_em", null),
        requisitosPrevistos(admin, fichaAtual),
        requisitosEmpresa(admin, pa.company_id),
      ]);
      const linha = (atual ?? {}) as Record<string, unknown>;
      const dados = (linha.dados ?? {}) as Record<string, unknown>;
      const checklist = montarChecklist({
        ficha: {
          data_nascimento: (linha.data_nascimento as string) ?? null,
          estado_civil: (linha.estado_civil as string) ?? null,
          sexo: (dados.sexo as string) ?? null,
        },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
        requisitosEmpresa: reqsEmpresa,
      });
      const status = String(linha.status ?? pa.status);
      // CPF informado pelo gestor no convite: o candidato vê, mas não altera.
      const cpfConvite = String(linha.cpf ?? pa.cpf ?? "").replace(/\D/g, "");
      if (cpfConvite) dados.cpf = cpfConvite;
      // Nome cadastrado pela empresa manda no formulário; o candidato apenas
      // avisa quando estiver errado.
      const nomeConvite = String(pa.candidato_nome ?? "").trim();
      if (nomeConvite) dados.nome = nomeConvite;
      // Telefone do convite aparece já preenchido (sem o código do país).
      if (!String(dados.telefone ?? "").trim()) {
        const zap = String(pa.whatsapp ?? "").replace(/\D/g, "").replace(/^55/, "");
        if (zap.length >= 10) dados.telefone = zap.slice(0, 11);
      }
      return {
        cpf_bloqueado: cpfConvite || null,
        nome_bloqueado: nomeConvite || null,
        candidato_nome: pa.candidato_nome,
        cargo_previsto: cargo?.nome ?? null,
        unidade_prevista: unidade?.nome ?? null,
        status,
        versao: Number(linha.versao ?? 0),
        editavel: candidatoPodeEditar(status),
        correcao_motivo: (linha.correcao_motivo as string) ?? null,
        dados,
        pessoas: pessoas ?? [],
        documentos: docs ?? [],
        checklist,
        pendencias: pendenciasDocumentais(checklist, (docs ?? []) as never).map((i) => i.key),
      };
    };

    /** Motivo devolvido pelo banco → resposta amigável, sempre fail closed. */
    const respostaMotivo = (motivo: string | undefined, status?: string, indice?: number) => {
      const conflito = motivo === "fase_encerrada" || motivo === "versao_alterada" ||
        motivo === "pessoa_desconhecida";
      const texto = MOTIVOS_GRAVACAO[motivo ?? ""] ??
        "Não foi possível salvar agora. Tente novamente.";
      return jsonResponse(req, conflito ? 409 : motivo?.startsWith("pessoa") ? 400 : 500, {
        error: indice ? `${texto} (familiar ${indice})` : texto,
        motivo,
        status,
      });
    };

    // Requisito 70: chave desconhecida na raiz derruba o pedido.
    const foraDaRaiz = camposNaoPermitidosRaiz(body);
    if (foraDaRaiz.length) {
      return jsonResponse(req, 400, {
        error: "Não foi possível processar o pedido: há informações inválidas no formulário.",
        campos_invalidos: foraDaRaiz,
      });
    }

    if (acao === "ler") {
      if (pa.status === "aguardando_preenchimento") {
        const t = await transicionar(admin, pa.id, ["aguardando_preenchimento"], "em_preenchimento");
        if (t.ok) await registrarEvento(admin, pa.id, pa.company_id, "preenchimento_iniciado");
      }
      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "salvar") {
      if (!candidatoPodeEditar(pa.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: pa.status });
      }

      // Requisito 70: campo fora da allowlist derruba o pedido (dados e familiares).
      const invasores = [...camposNaoPermitidos(body?.dados), ...camposNaoPermitidosPessoas(body?.pessoas)];
      if (invasores.length) {
        return jsonResponse(req, 400, {
          error: "Não foi possível salvar: há informações inválidas no formulário.",
          campos_invalidos: invasores,
        });
      }
      if (body?.pessoas !== undefined && !Array.isArray(body?.pessoas)) {
        return jsonResponse(req, 400, { error: "Não foi possível ler a lista de familiares." });
      }

      const dados = { ...((pa.dados ?? {}) as Record<string, unknown>), ...filtrarCamposCandidato(body?.dados) };
      const erros = validarDadosCandidato(dados);
      if (Object.keys(erros).length) {
        return jsonResponse(req, 400, { error: "Confira as informações destacadas.", erros });
      }

      const texto = (k: string) => {
        const v = dados[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      const proximo = pa.status === "correcao_solicitada"
        ? "aguardando_nova_versao"
        : pa.status === "aguardando_preenchimento"
        ? "em_preenchimento"
        : null;

      // A versão que acompanhou os dados no navegador precisa continuar valendo:
      // gravação em cima de uma ficha já alterada é recusada com aviso, jamais
      // descartada em silêncio. A versão é OBRIGATÓRIA: sem ela a proteção não
      // existiria e a gravação seria cega.
      const versaoBruta = Number(body?.versao);
      if (body?.versao === undefined || body?.versao === null
          || !Number.isInteger(versaoBruta) || versaoBruta < 0) {
        return jsonResponse(req, 400, {
          error: "Não foi possível ler a versão da ficha. Recarregue a página e tente novamente.",
        });
      }
      const versaoEsperada: number = versaoBruta;
      // O CPF do convite também vale dentro do bloco de dados.
      const cpfConvite = String(pa.cpf ?? "").replace(/\D/g, "");
      if (cpfConvite) dados.cpf = cpfConvite;
      // O nome é da empresa: o que vier do candidato é descartado.
      const nomeConvite = String(pa.candidato_nome ?? "").trim();
      if (nomeConvite) dados.nome = nomeConvite;



      // Dados, familiares e remoções em uma única transação com trava na ficha:
      // um "enviar" simultâneo não consegue fechar a ficha no meio da gravação.
      const gravado = await salvarCandidato(admin, {
        preadmissaoId: pa.id,
        estados: ESTADOS_EDITAVEIS_CANDIDATO,
        statusNovo: proximo,
        versaoEsperada,
        dados,
        campos: {
          // Quando o CPF veio no convite, ele manda: o que o candidato mandar
          // no lugar é descartado (a conferência de duplicidade já foi feita).
          cpf: String(pa.cpf ?? "").replace(/\D/g, "") || (texto("cpf") ?? "").replace(/\D/g, ""),
          email: texto("email") ?? "",
          data_nascimento: texto("data_nascimento") ?? "",
          estado_civil: texto("estado_civil") ?? "",
        },
        pessoas: Array.isArray(body?.pessoas) ? filtrarPessoasCandidato(body.pessoas) : null,
      });
      if (!gravado.ok) return respostaMotivo(gravado.motivo, gravado.status, gravado.indice);

      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "enviar") {
      if (!candidatoPodeEditar(pa.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: pa.status });
      }
      // A conferência vale para a versão lida agora; se algo mudar antes do
      // envio, o banco recusa e o candidato revalida.
      const estado = await carregar();
      if (!candidatoPodeEditar(estado.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: estado.status });
      }
      const dados = estado.dados as Record<string, unknown>;
      const erros = validarDadosCandidato(dados);
      const faltando = OBRIGATORIOS.filter((campo) => {
        const v = dados[campo];
        return !(typeof v === "string" ? v.trim() : v);
      });
      if (faltando.length || estado.pendencias.length || Object.keys(erros).length) {
        return jsonResponse(req, 400, {
          error: "Ainda faltam informações ou documentos obrigatórios.",
          campos_faltando: faltando,
          documentos_faltando: estado.pendencias,
          erros,
        });
      }
      const t = await enviarFicha(admin, pa.id, ESTADOS_EDITAVEIS_CANDIDATO, estado.versao);
      if (!t.ok) return respostaMotivo(t.motivo, t.status);
      if (t.status_anterior === "aguardando_nova_versao") {
        await registrarEvento(admin, pa.id, pa.company_id, "ficha_reenviada");
      }
      // Aviso interno para o time de Pessoas; falha aqui não invalida o envio.
      try {
        await admin.from("dp_notificacoes").insert({
          company_id: pa.company_id,
          tipo: "preadmissao_enviada",
          titulo: "Pré-admissão enviada pelo candidato",
          descricao: `${pa.candidato_nome ?? "Candidato"} concluiu o preenchimento da ficha.`,
          ref_table: "dp_preadmissoes",
          ref_id: pa.id,
          para_admins: true,
        });
      } catch (_) {
        // silencioso de propósito
      }
      return jsonResponse(req, 200, {
        success: true,
        mensagem: "Seus dados e documentos foram enviados para análise da empresa.",
      });
    }

    // Nome e CPF são conferidos pela empresa. O candidato não altera: registra
    // o aviso, e o gestor decide. Nada da ficha muda aqui.
    if (acao === "pedir_correcao") {
      const campo = String(body?.campo ?? "").trim().slice(0, 60);
      const mensagem = String(body?.mensagem ?? "").trim().slice(0, 500);
      if (!campo || !mensagem) {
        return jsonResponse(req, 400, { error: "Escreva o que está errado e o dado correto." });
      }
      await registrarEvento(admin, pa.id, pa.company_id, "correcao_identidade_pedida", {
        campo,
        mensagem,
      });
      try {
        await admin.from("dp_notificacoes").insert({
          company_id: pa.company_id,
          tipo: "preadmissao_enviada",
          titulo: "Candidato apontou erro em nome ou CPF",
          descricao: `${pa.candidato_nome ?? "Candidato"} — ${campo}: ${mensagem}`,
          ref_table: "dp_preadmissoes",
          ref_id: pa.id,
          para_admins: true,
        });
      } catch (_) {
        // aviso interno: falha aqui não invalida o registro do evento
      }
      return jsonResponse(req, 200, { success: true });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
