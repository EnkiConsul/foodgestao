/**
 * Sanitiza um nome de arquivo para ser usado como chave (path) do Supabase Storage.
 * Remove acentos e substitui caracteres inválidos (não [A-Za-z0-9._-]) por "_".
 * O nome original deve continuar sendo persistido separadamente para exibição.
 */
export function sanitizeStorageFilename(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "arquivo"
  );
}
