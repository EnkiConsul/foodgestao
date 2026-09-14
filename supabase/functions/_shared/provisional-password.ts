/**
 * Senha provisória aleatória (não derivada do CPF nem de qualquer identificador
 * de login). Curta e fácil de digitar no celular, sem caracteres ambíguos, mas
 * ainda com maiúscula, minúscula, número e símbolo — exigência do servidor de
 * contas.
 */
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const SIMBOLOS = "!@#$*";
const ALPHABET = MAIUSCULAS + MINUSCULAS + NUMEROS + SIMBOLOS;

function pick(alphabet: string): string {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return alphabet[b[0] % alphabet.length];
}

export function generateProvisionalPassword(length = 8): string {
  const total = Math.max(8, length);
  const chars = [pick(MAIUSCULAS), pick(MINUSCULAS), pick(NUMEROS), pick(SIMBOLOS)];
  while (chars.length < total) chars.push(pick(ALPHABET));
  // Embaralha para não deixar as classes em posições fixas.
  for (let i = chars.length - 1; i > 0; i--) {
    const b = new Uint8Array(1);
    crypto.getRandomValues(b);
    const j = b[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
