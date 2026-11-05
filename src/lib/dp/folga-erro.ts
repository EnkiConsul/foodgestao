/** Preserva a explicação do servidor, removendo apenas o código de domínio. */
export function mensagemErroFolga(erro: unknown): string {
  const mensagem = typeof erro === "string" ? erro :
    erro && typeof erro === "object" && "message" in erro && typeof erro.message === "string" ? erro.message : "";
  const texto = mensagem.replace(/^[A-Z][A-Z_0-9]*:\s*/, "").trim();
  return texto || "Não foi possível salvar a folga. Verifique sua conexão e tente novamente.";
}