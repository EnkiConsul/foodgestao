/**
 * Regra única de senha do AVETO 360 (S3).
 *
 * Vale para TODOS os caminhos que DEFINEM senha: criar conta, redefinição por
 * link, redefinição por código, primeiro acesso e ativação do portal do
 * colaborador. Não vale para ENTRAR: o login continua aceitando a senha antiga,
 * sem exigência de tamanho ou de classes.
 *
 * Espelho no servidor: supabase/functions/_shared/password-policy.ts
 * (o teste src/test/unit/passwordPolicy.test.ts falha se os dois divergirem).
 *
 * Nada aqui vai para a rede: a avaliação e o medidor são locais.
 */

/** Mínimo de caracteres para qualquer senha nova. */
export const SENHA_MIN = 12;

/**
 * Máximo em BYTES (UTF-8). O serviço de contas usa bcrypt, que ignora o que
 * passa de 72 bytes; recusamos explicitamente em vez de truncar em silêncio.
 */
export const SENHA_MAX_BYTES = 72;

/**
 * Conjunto de símbolos aceito pelo servidor de contas (ASCII configurado lá).
 * Espaço e letra acentuada NÃO contam como símbolo.
 */
export const SIMBOLOS_ACEITOS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
const RE_SIMBOLO = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

export type SenhaProblema =
  | "curta"
  | "longa"
  | "sem_maiuscula"
  | "sem_minuscula"
  | "sem_numero"
  | "sem_simbolo"
  | "comum"
  | "sequencial"
  | "repetida"
  | "dado_pessoal";

export const MENSAGENS_SENHA: Record<SenhaProblema, string> = {
  curta: `Use pelo menos ${SENHA_MIN} caracteres`,
  longa: `A senha passa do limite de ${SENHA_MAX_BYTES} bytes do servidor de contas — letras acentuadas e emojis ocupam mais de 1 byte cada`,
  sem_maiuscula: "Inclua ao menos 1 letra maiúscula",
  sem_minuscula: "Inclua ao menos 1 letra minúscula",
  sem_numero: "Inclua ao menos 1 número",
  sem_simbolo: "Inclua ao menos 1 símbolo do conjunto aceito: ! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : \" | < > ? , . / ` ~ (espaço e letra acentuada não valem)",
  comum: "Essa senha é muito comum. Escolha outra combinação",
  sequencial: "Evite sequências como 123456 ou abcdef",
  repetida: "Evite repetir o mesmo caractere muitas vezes",
  dado_pessoal: "Não use seu nome, e-mail ou CPF na senha",
};

/** Senhas e raízes previsíveis (comparação sem acento, sem caixa e sem trocas óbvias). */
const COMUNS = [
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
  "senha", "senha123", "minhasenha", "novasenha", "password", "passw0rd",
  "qwerty", "qwertyui", "asdfgh", "zxcvbn", "iloveyou", "admin", "administrador",
  "aveto", "aveto360", "360food", "gestorplin", "restaurante", "brasil",
  "flamengo", "corinthians", "palmeiras", "saopaulo", "gremio", "cruzeiro",
  "teste", "teste123", "abcd1234", "abc123", "trocar123", "mudar123",
  "primeiroacesso", "acesso123", "empresa123", "master", "letmein", "welcome",
];

const SEQUENCIAS = [
  "0123456789", "9876543210", "abcdefghijklmnopqrstuvwxyz",
  "zyxwvutsrqponmlkjihgfedcba", "qwertyuiop", "asdfghjkl", "zxcvbnm",
];

/** Normaliza para comparar: sem acento, minúscula e desfazendo trocas de teclado óbvias. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
}

/** Só minúscula/sem acento e apenas letras e números: preserva dígitos (CPF). */
function normalizarBasico(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function tamanhoEmBytes(senha: string): number {
  return new TextEncoder().encode(senha).length;
}

function temSequencia(...formas: string[]): boolean {
  for (const forma of formas) {
    const limpa = forma.replace(/[^a-z0-9]/g, "");
    for (const seq of SEQUENCIAS) {
      for (let i = 0; i + 5 <= seq.length; i++) {
        if (limpa.includes(seq.slice(i, i + 5))) return true;
      }
    }
  }
  return false;
}

function temRepeticao(senha: string): boolean {
  return /(.)\1{3,}/.test(senha);
}

const COMUNS_NORMALIZADOS = [
  ...new Set(COMUNS.flatMap((c) => [normalizarBasico(c), normalizar(c).replace(/[^a-z0-9]/g, "")])),
].filter((c) => c.length >= 4);

function ehComum(...formas: string[]): boolean {
  return formas.some((forma) => {
    const limpa = forma.replace(/[^a-z0-9]/g, "");
    return COMUNS_NORMALIZADOS.some((c) => limpa.includes(c));
  });
}

/** Pedaços de dados pessoais que não podem aparecer na senha. */
export function pedacosPessoais(dados?: {
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
}): string[] {
  const pedacos: string[] = [];
  const nome = (dados?.nome ?? "").trim();
  if (nome) {
    for (const parte of nome.split(/\s+/)) {
      const limpa = normalizarBasico(parte);
      if (limpa.length >= 4) pedacos.push(limpa);
    }
  }
  const email = (dados?.email ?? "").trim();
  if (email) {
    // separa antes de normalizar: a normalização troca "@" por "a"
    const local = normalizarBasico(email.split("@")[0] ?? "");
    if (local.length >= 4) pedacos.push(local);
  }
  const cpf = (dados?.cpf ?? "").replace(/\D/g, "");
  if (cpf.length === 11) pedacos.push(cpf);
  return pedacos;
}

export interface AvaliacaoSenha {
  valida: boolean;
  problemas: SenhaProblema[];
  /** Primeira mensagem em português, ou null quando a senha está aprovada. */
  mensagem: string | null;
  /** 0 a 4, apenas para o medidor visual. */
  pontuacao: number;
  rotulo: "Muito fraca" | "Fraca" | "Razoável" | "Forte" | "Muito forte";
}

/** Aplica a regra completa. Use nos caminhos que DEFINEM senha. */
export function avaliarSenha(
  senha: string,
  dados?: { nome?: string | null; email?: string | null; cpf?: string | null },
): AvaliacaoSenha {
  const problemas: SenhaProblema[] = [];
  const normalizada = normalizar(senha);

  if (senha.length < SENHA_MIN) problemas.push("curta");
  if (tamanhoEmBytes(senha) > SENHA_MAX_BYTES) problemas.push("longa");
  if (!/[A-Z]/.test(senha)) problemas.push("sem_maiuscula");
  if (!/[a-z]/.test(senha)) problemas.push("sem_minuscula");
  if (!/[0-9]/.test(senha)) problemas.push("sem_numero");
  if (!RE_SIMBOLO.test(senha)) problemas.push("sem_simbolo");
  const basicaPrevia = normalizarBasico(senha);
  if (senha && ehComum(basicaPrevia, normalizada)) problemas.push("comum");
  if (senha && temSequencia(basicaPrevia, normalizada)) problemas.push("sequencial");
  if (senha && temRepeticao(senha)) problemas.push("repetida");

  const pedacos = pedacosPessoais(dados);
  const basica = basicaPrevia;
  if (senha && pedacos.some((p) => basica.includes(p) || normalizada.replace(/[^a-z0-9]/g, "").includes(p))) {
    problemas.push("dado_pessoal");
  }

  const { pontuacao, rotulo } = medirForca(senha, problemas);

  return {
    valida: problemas.length === 0,
    problemas,
    mensagem: problemas.length ? MENSAGENS_SENHA[problemas[0]] : null,
    pontuacao,
    rotulo,
  };
}

const ROTULOS: AvaliacaoSenha["rotulo"][] = [
  "Muito fraca",
  "Fraca",
  "Razoável",
  "Forte",
  "Muito forte",
];

/**
 * Medidor local e HEURÍSTICO (não sai da máquina): serve apenas de orientação
 * visual, não é medida de entropia real nem substitui a regra de avaliarSenha.
 */
/** Medidor local (não sai da máquina): tamanho, variedade e ausência de padrões óbvios. */
export function medirForca(
  senha: string,
  problemas: SenhaProblema[] = [],
): { pontuacao: number; rotulo: AvaliacaoSenha["rotulo"] } {
  if (!senha) return { pontuacao: 0, rotulo: ROTULOS[0] };

  let pontos = 0;
  if (senha.length >= 8) pontos += 1;
  if (senha.length >= SENHA_MIN) pontos += 1;
  if (senha.length >= 16) pontos += 1;

  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, RE_SIMBOLO].filter((r) => r.test(senha)).length;
  if (classes >= 3) pontos += 1;
  if (classes === 4) pontos += 1;
  if (new Set(senha).size >= 10) pontos += 1;

  const previsivel = problemas.some((p) => p === "comum" || p === "sequencial" || p === "repetida" || p === "dado_pessoal");
  if (previsivel) pontos = Math.min(pontos, 1);
  if (senha.length < SENHA_MIN) pontos = Math.min(pontos, 2);

  const pontuacao = Math.max(0, Math.min(4, pontos - 2));
  return { pontuacao, rotulo: ROTULOS[pontuacao] };
}

/** Traduz recusas do serviço de contas para linguagem simples. */
export function mensagemDoServidorDeContas(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("should contain at least one character"))
    return "A senha precisa ter maiúscula, minúscula, número e um símbolo (como ! @ # *).";
  if (m.includes("at least") && m.includes("characters"))
    return MENSAGENS_SENHA.curta + ".";
  if (m.includes("different from the old") || m.includes("should be different"))
    return "Escolha uma senha diferente da anterior.";
  if (m.includes("pwned") || m.includes("compromised") || m.includes("leaked") || m.includes("known to be"))
    return "Essa senha apareceu em vazamentos conhecidos. Escolha outra combinação.";
  if (m.includes("weak"))
    return "Essa senha foi recusada por ser fraca, comum ou por faltar maiúscula, minúscula, número ou símbolo. Escolha outra combinação.";
  return "Não foi possível salvar essa senha. Tente outra combinação.";
}
