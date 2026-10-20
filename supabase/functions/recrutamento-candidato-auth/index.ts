/**
 * Recrutamento 360 — cadastro, login, vínculo e recuperação de candidatos.
 *
 * Isolado do login do Pessoas 360/Financeiro: só LÊ `resolve_login_identifier`
 * (para colaborador entrar com a mesma senha) e nunca altera contas que não
 * sejam de candidato puro. Regras:
 *  - CPF nunca vai para o e-mail técnico nem para os metadados da conta.
 *  - CPF já existente só é ligado ao perfil depois de login com a senha da conta.
 *  - Recuperação exige CPF + data de nascimento + código no WhatsApp do perfil,
 *    e só vale para contas criadas pelo Recrutamento (contas reaproveitadas
 *    recuperam pela tela principal).
 *  - Respostas neutras (sem enumeração), Turnstile, limites por IP/CPF/telefone,
 *    logs sem CPF, telefone, senha ou código.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { verifyTurnstileToken } from "../_shared/turnstile.ts";
import { checkZapiStatus, normalizeBRPhone, sendZapiText, timingSafeEqualHex } from "../_shared/zapi.ts";
import { avaliarSenha } from "../_shared/password-policy.ts";
import { clientIp, isRateLimited, sha256Hex } from "../_shared/rate-limit.ts";

const TTL_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const MAX_CPFS_POR_WHATSAPP = 3;
const DOMINIO = "portal.360food.local"; // fora do teste grátis automático; e-mail sem CPF
const NEUTRO_REC =
  "Se os dados conferirem com um cadastro de candidato, enviamos um código para o WhatsApp cadastrado.";

const cpfZ = z.string().transform((s) => s.replace(/\D+/g, "")).pipe(z.string().length(11));
const dataZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const codigoZ = z.string().trim().regex(/^\d{6}$/);
const tsZ = z.string().min(10).max(4096);

const Body = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("cadastro_iniciar"), cpf: cpfZ, nome: z.string().trim().min(5).max(120),
    data_nascimento: dataZ, whatsapp: z.string().trim().max(24), aceite: z.literal(true), turnstile_token: tsZ,
  }),
  z.object({ acao: z.literal("cadastro_concluir"), desafio_id: z.string().uuid(), codigo: codigoZ, senha: z.string().min(1).max(256) }),
  z.object({ acao: z.literal("login"), cpf: cpfZ, senha: z.string().min(1).max(256), turnstile_token: tsZ }),
  z.object({
    acao: z.literal("vincular_iniciar"), cpf: cpfZ.optional(), nome: z.string().trim().min(5).max(120),
    data_nascimento: dataZ, whatsapp: z.string().trim().max(24), aceite: z.literal(true),
  }),
  z.object({ acao: z.literal("vincular_concluir"), desafio_id: z.string().uuid(), codigo: codigoZ }),
  z.object({ acao: z.literal("recuperar_iniciar"), cpf: cpfZ, data_nascimento: dataZ, turnstile_token: tsZ }),
  z.object({ acao: z.literal("recuperar_concluir"), desafio_id: z.string().uuid(), codigo: codigoZ, senha: z.string().min(1).max(256) }),
]);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function cpfValido(c: string): boolean {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function dataValida(d: string): boolean {
  const t = new Date(`${d}T12:00:00Z`).getTime();
  if (Number.isNaN(t)) return false;
  const idade = (Date.now() - t) / (365.25 * 86400000);
  return idade >= 14 && idade <= 90;
}
const cpfHash = (cpf: string) => sha256Hex(`recrutamento:cpf:${cpf}`);
const mascaraCpf = (cpf: string) => `***.***.${cpf.slice(6, 9)}-**`;
function otp6() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json(400, { error: "Confira os dados informados." });
  const b = parsed.data;

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ip = clientIp(req);
  const ipHash = await sha256Hex(`rec-cand:ip:${ip}`);

  const limite = async (bucket: string, chave: string, max: number) =>
    await isRateLimited(admin, bucket, await sha256Hex(`${bucket}:${chave}`), max);
  const captcha = async (token: string) =>
    (await verifyTurnstileToken({ token, ip, contexto: `recrutamento-${b.acao}` })).ok;

  const enviarCodigo = async (
    finalidade: "cadastro" | "vincular" | "recuperacao",
    telefone: string,
    dados: { user_id?: string; cpf?: string; cpf_hash?: string; nome?: string; data_nascimento?: string },
    texto: (codigo: string) => string,
  ) => {
    const st = await checkZapiStatus();
    if (!st.connected) return { erro: "O WhatsApp da Aveto está indisponível agora. Tente de novo em alguns minutos." };
    const codigo = otp6();
    const id = crypto.randomUUID();
    await admin.from("recrutamento_auth_desafios").insert({
      id, finalidade, telefone, ...dados,
      code_hash: await sha256Hex(`${id}:${codigo}`),
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    const r = await sendZapiText(telefone, texto(codigo));
    if (!r.ok) return { erro: "Não conseguimos entregar o código neste WhatsApp. Confira o número." };
    return { id, final: telefone.slice(-4) };
  };

  // deno-lint-ignore no-explicit-any
  const conferirCodigo = async (desafioId: string, codigo: string, finalidade: string): Promise<any | string> => {
    const { data: d } = await admin.from("recrutamento_auth_desafios").select("*").eq("id", desafioId).maybeSingle();
    if (!d || d.finalidade !== finalidade || d.usado_em) return "Código inválido. Peça um novo.";
    if (new Date(d.expires_at).getTime() < Date.now()) return "Código expirado. Peça um novo.";
    if (d.tentativas >= MAX_TENTATIVAS) return "Muitas tentativas. Peça um novo código.";
    const ok = timingSafeEqualHex(await sha256Hex(`${d.id}:${codigo}`), d.code_hash);
    if (!ok) {
      await admin.from("recrutamento_auth_desafios").update({ tentativas: d.tentativas + 1 }).eq("id", d.id);
      return d.tentativas + 1 >= MAX_TENTATIVAS ? "Muitas tentativas. Peça um novo código." : "Código incorreto.";
    }
    return d;
  };

  const usuarioDoToken = async () => {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return null;
    const { data } = await admin.auth.getUser(auth.slice(7));
    return data?.user ?? null;
  };

  const cpfDeOutraConta = async (cpf: string, exceto?: string) => {
    const { data: cand } = await admin.from("recrutamento_candidatos").select("user_id").eq("cpf_hash", await cpfHash(cpf)).maybeSingle();
    if (cand && cand.user_id !== exceto) return true;
    const { data: r } = await admin.rpc("resolve_login_identifier", { _identifier: cpf });
    const row = Array.isArray(r) ? r[0] : r;
    return !!(row?.source === "cpf" && row?.user_id && row.user_id !== exceto);
  };

  try {
    // ---------------- CADASTRO ----------------
    if (b.acao === "cadastro_iniciar") {
      if (!(await captcha(b.turnstile_token))) return json(400, { error: "Verificação de segurança falhou. Recarregue e tente de novo.", code: "captcha_failed" });
      if (await limite("rec_cad_ip", ip, 10)) return json(429, { error: "Muitas tentativas. Tente novamente mais tarde." });
      if (!cpfValido(b.cpf)) return json(400, { error: "CPF inválido." });
      if (!dataValida(b.data_nascimento)) return json(400, { error: "Data de nascimento inválida." });
      const tel = normalizeBRPhone(b.whatsapp);
      if (!tel) return json(400, { error: "WhatsApp inválido. Informe com DDD." });
      if (await limite("rec_cad_cpf", b.cpf, 5) || await limite("rec_cad_tel", tel, 5)) {
        return json(429, { error: "Muitas tentativas. Tente novamente mais tarde." });
      }
      if (await cpfDeOutraConta(b.cpf)) {
        // Resposta igual à de sucesso: aviso só vai para o WhatsApp digitado.
        await sendZapiText(tel, "AVETO 360: já existe um acesso para os dados informados. Entre com seu CPF e senha ou use \"Esqueci minha senha\".");
        console.log("[rec-cand] cadastro_iniciar: identidade existente");
        return json(200, { desafio_id: crypto.randomUUID(), final: tel.slice(-4) });
      }
      const { count } = await admin.from("recrutamento_candidatos").select("id", { count: "exact", head: true }).eq("whatsapp", tel);
      if ((count ?? 0) >= MAX_CPFS_POR_WHATSAPP) return json(400, { error: "Este WhatsApp já atingiu o limite de cadastros. Use outro número." });
      const r = await enviarCodigo("cadastro", tel, { cpf: b.cpf, cpf_hash: await cpfHash(b.cpf), nome: b.nome, data_nascimento: b.data_nascimento },
        (c) => `Seu código de cadastro no AVETO Recrutamento 360 é: ${c}\n\nVálido por 10 minutos. Não compartilhe.`);
      if ("erro" in r) return json(503, { error: r.erro });
      return json(200, { desafio_id: r.id, final: r.final });
    }

    if (b.acao === "cadastro_concluir") {
      const d = await conferirCodigo(b.desafio_id, b.codigo, "cadastro");
      if (typeof d === "string") return json(400, { error: d });
      const av = avaliarSenha(b.senha, { nome: d.nome, cpf: d.cpf });
      if (!av.valida) return json(400, { error: av.mensagem ?? "Senha fraca." });
      if (await cpfDeOutraConta(d.cpf)) return json(409, { error: "Já existe um acesso para este CPF. Entre com sua senha." });
      await admin.from("recrutamento_auth_desafios").update({ usado_em: new Date().toISOString() }).eq("id", d.id);
      const email = `cand-${crypto.randomUUID()}@${DOMINIO}`;
      const { data: cu, error: ce } = await admin.auth.admin.createUser({
        email, password: b.senha, email_confirm: true, user_metadata: { full_name: d.nome, origem: "recrutamento" },
      });
      if (ce || !cu?.user) return json(500, { error: "Não foi possível criar o acesso. Tente novamente." });
      const agora = new Date().toISOString();
      const { error: ie } = await admin.from("recrutamento_candidatos").insert({
        user_id: cu.user.id, cpf: d.cpf, cpf_hash: d.cpf_hash, nome: d.nome, data_nascimento: d.data_nascimento,
        whatsapp: d.telefone, whatsapp_verificado_em: agora, consentimento_em: agora, declaracao_veracidade_em: agora,
      });
      if (ie) {
        await admin.auth.admin.deleteUser(cu.user.id);
        return json(409, { error: "Já existe um acesso para este CPF. Entre com sua senha." });
      }
      const ac = createClient(url, anon, { auth: { persistSession: false } });
      const { data: s } = await ac.auth.signInWithPassword({ email, password: b.senha });
      return json(200, { session: s?.session ? { access_token: s.session.access_token, refresh_token: s.session.refresh_token } : null });
    }

    // ---------------- LOGIN ----------------
    if (b.acao === "login") {
      if (!(await captcha(b.turnstile_token))) return json(400, { error: "Verificação de segurança falhou. Recarregue e tente de novo.", code: "captcha_failed" });
      const idHash = await sha256Hex(`rec-login:${b.cpf}`);
      const { data: probe } = await admin.rpc("record_login_attempt", { _identifier_hash: idHash, _ip: ip === "unknown" ? null : ip, _success: true });
      const pr = Array.isArray(probe) ? probe[0] : probe;
      if (pr?.blocked) return json(429, { error: "Muitas senhas incorretas. Aguarde alguns minutos ou use \"Esqueci minha senha\"." });

      let email: string | undefined;
      const { data: cand } = await admin.from("recrutamento_candidatos").select("user_id").eq("cpf_hash", await cpfHash(b.cpf)).maybeSingle();
      if (cand) {
        const { data: u } = await admin.auth.admin.getUserById(cand.user_id);
        email = u?.user?.email ?? undefined;
      } else {
        const { data: r } = await admin.rpc("resolve_login_identifier", { _identifier: b.cpf });
        const row = Array.isArray(r) ? r[0] : r;
        if (row?.source === "cpf") email = row.email;
      }
      let session: { access_token: string; refresh_token: string } | null = null;
      if (email) {
        const ac = createClient(url, anon, { auth: { persistSession: false } });
        const { data } = await ac.auth.signInWithPassword({ email, password: b.senha });
        if (data?.session) session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
      } else {
        await new Promise((r) => setTimeout(r, 250));
      }
      await admin.rpc("record_login_attempt", { _identifier_hash: idHash, _ip: ip === "unknown" ? null : ip, _success: !!session });
      if (!session) return json(401, { error: "CPF ou senha incorretos." });
      return json(200, { session, tem_perfil: !!cand });
    }

    // ---------------- VÍNCULO DE CONTA EXISTENTE ----------------
    if (b.acao === "vincular_iniciar") {
      const user = await usuarioDoToken();
      if (!user) return json(401, { error: "Entre na sua conta primeiro." });
      if (await limite("rec_vinc_user", user.id, 5)) return json(429, { error: "Muitas tentativas. Tente novamente mais tarde." });
      const { data: ja } = await admin.from("recrutamento_candidatos").select("id").eq("user_id", user.id).maybeSingle();
      if (ja) return json(409, { error: "Seu perfil de candidato já existe." });
      // CPF do colaborador vem do cadastro da empresa (comprovado pelo login); senão, o informado.
      const { data: colab } = await admin.from("dp_colaboradores").select("cpf").eq("user_id", user.id).not("cpf", "is", null).limit(1).maybeSingle();
      const cpf = colab?.cpf ? String(colab.cpf).replace(/\D+/g, "") : b.cpf;
      if (!cpf || !cpfValido(cpf)) return json(400, { error: "Informe um CPF válido." });
      if (!dataValida(b.data_nascimento)) return json(400, { error: "Data de nascimento inválida." });
      if (await cpfDeOutraConta(cpf, user.id)) return json(409, { error: "Este CPF já tem outro acesso. Entre com ele." });
      const tel = normalizeBRPhone(b.whatsapp);
      if (!tel) return json(400, { error: "WhatsApp inválido. Informe com DDD." });
      const { count } = await admin.from("recrutamento_candidatos").select("id", { count: "exact", head: true }).eq("whatsapp", tel);
      if ((count ?? 0) >= MAX_CPFS_POR_WHATSAPP) return json(400, { error: "Este WhatsApp já atingiu o limite de cadastros. Use outro número." });
      const r = await enviarCodigo("vincular", tel, { user_id: user.id, cpf, cpf_hash: await cpfHash(cpf), nome: b.nome, data_nascimento: b.data_nascimento },
        (c) => `Seu código para ativar o perfil de candidato AVETO é: ${c}\n\nVálido por 10 minutos. Não compartilhe.`);
      if ("erro" in r) return json(503, { error: r.erro });
      return json(200, { desafio_id: r.id, final: r.final, cpf_do_cadastro: !!colab?.cpf });
    }

    if (b.acao === "vincular_concluir") {
      const user = await usuarioDoToken();
      if (!user) return json(401, { error: "Entre na sua conta primeiro." });
      const d = await conferirCodigo(b.desafio_id, b.codigo, "vincular");
      if (typeof d === "string") return json(400, { error: d });
      if (d.user_id !== user.id) return json(400, { error: "Código inválido. Peça um novo." });
      if (await cpfDeOutraConta(d.cpf, user.id)) return json(409, { error: "Este CPF já tem outro acesso." });
      await admin.from("recrutamento_auth_desafios").update({ usado_em: new Date().toISOString() }).eq("id", d.id);
      const agora = new Date().toISOString();
      const { error } = await admin.from("recrutamento_candidatos").insert({
        user_id: user.id, cpf: d.cpf, cpf_hash: d.cpf_hash, nome: d.nome, data_nascimento: d.data_nascimento,
        whatsapp: d.telefone, whatsapp_verificado_em: agora, conta_reutilizada: true,
        consentimento_em: agora, declaracao_veracidade_em: agora,
      });
      if (error) return json(409, { error: "Não foi possível ativar o perfil. Ele pode já existir." });
      return json(200, { ok: true });
    }

    // ---------------- RECUPERAÇÃO ----------------
    if (b.acao === "recuperar_iniciar") {
      if (!(await captcha(b.turnstile_token))) return json(400, { error: "Verificação de segurança falhou. Recarregue e tente de novo.", code: "captcha_failed" });
      if (await limite("rec_rec_ip", ip, 10) || await limite("rec_rec_cpf", b.cpf, 3)) {
        return json(429, { error: "Muitas tentativas. Tente novamente mais tarde." });
      }
      const neutro = { desafio_id: crypto.randomUUID(), mensagem: NEUTRO_REC };
      const { data: c } = await admin.from("recrutamento_candidatos")
        .select("user_id, cpf, whatsapp, data_nascimento, conta_reutilizada").eq("cpf_hash", await cpfHash(b.cpf)).maybeSingle();
      if (!c || c.data_nascimento !== b.data_nascimento || c.conta_reutilizada) {
        await new Promise((r) => setTimeout(r, 300));
        return json(200, neutro);
      }
      if (await limite("rec_rec_tel", c.whatsapp, 5)) return json(200, neutro);
      const r = await enviarCodigo("recuperacao", c.whatsapp, { user_id: c.user_id, cpf_hash: await cpfHash(b.cpf) },
        (code) => `AVETO Recrutamento 360 — redefinição de senha do CPF ${mascaraCpf(c.cpf)}.\nCódigo: ${code}\n\nVálido por 10 minutos. Se não foi você, ignore.`);
      if ("erro" in r) return json(200, neutro);
      return json(200, { desafio_id: r.id, mensagem: NEUTRO_REC });
    }

    if (b.acao === "recuperar_concluir") {
      const d = await conferirCodigo(b.desafio_id, b.codigo, "recuperacao");
      if (typeof d === "string") return json(400, { error: d });
      const { data: c } = await admin.from("recrutamento_candidatos").select("nome, cpf, conta_reutilizada").eq("user_id", d.user_id).maybeSingle();
      if (!c || c.conta_reutilizada) return json(400, { error: "Código inválido. Peça um novo." });
      const av = avaliarSenha(b.senha, { nome: c.nome, cpf: c.cpf });
      if (!av.valida) return json(400, { error: av.mensagem ?? "Senha fraca." });
      await admin.from("recrutamento_auth_desafios").update({ usado_em: new Date().toISOString() }).eq("id", d.id);
      const { error } = await admin.auth.admin.updateUserById(d.user_id, { password: b.senha });
      if (error) return json(500, { error: "Não foi possível trocar a senha. Tente novamente." });
      return json(200, { ok: true });
    }
    return json(400, { error: "Ação inválida." });
  } catch (_e) {
    console.error(`[rec-cand] erro em ${b.acao} ip=${ipHash.slice(0, 8)}`);
    return json(500, { error: "Erro inesperado. Tente novamente." });
  }
});
