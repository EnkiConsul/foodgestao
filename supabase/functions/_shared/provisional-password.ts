/**
 * Senha provisória aleatória (não derivada do CPF nem de qualquer identificador
 * de login). Alfabeto sem caracteres ambíguos para facilitar a digitação.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateProvisionalPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
