// ------------------------------------------------------------------
// Termos de compensação de jornada (assinados pelo colaborador no portal).
//
// 1) Compensação semanal (CLT art. 59, §6º) — sugerido quando algum dia
//    passa de 8h líquidas.
// 2) Banco de horas (CLT art. 59, §§2º e 5º) — sugerido quando a unidade
//    adota banco de horas.
// 3) Trabalho e compensação em feriados (Lei 10.101/2000, art. 6º-A) —
//    sugerido quando a unidade adota compensação de feriados.
//
// Banco de horas e feriados no comércio dependem de negociação com o
// sindicato (CCT/ACT): os textos citam a convenção vigente.
// Qualquer mudança de redação exige nova versão.
// ------------------------------------------------------------------
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { cpfFmt, gerarPdf } from "@/lib/dp/termos-freelancer";

export type TermoCompensacaoTipo = "semanal" | "banco_horas" | "feriados";

export const TERMOS_COMPENSACAO: Record<TermoCompensacaoTipo, { titulo: string; versao: string }> = {
  semanal: { titulo: "Acordo Individual de Compensação Semanal de Horas", versao: "v1" },
  banco_horas: { titulo: "Acordo Individual de Banco de Horas", versao: "v1" },
  feriados: { titulo: "Acordo de Trabalho e Compensação em Feriados", versao: "v1" },
};

/** Minutos líquidos que ultrapassam 8h em um dia. */
export const LIMITE_DIARIO_MIN = 8 * 60;

/** Dias com carga líquida acima de 8h. */
export function diasAcimaDe8h(detalhes: { dow: number; trabalha: boolean; minutos: number }[]) {
  return detalhes.filter((d) => d.trabalha && d.minutos > LIMITE_DIARIO_MIN);
}

/** Dias corridos entre hoje (data local) e a data pedida. */
export function diasDeAntecedencia(dataIso: string, hojeIso: string): number {
  const [a, b] = [dataIso, hojeIso].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

export const MOTIVO_COMPENSACAO_FERIADO = "Compensação de feriado trabalhado";
export const ehCompensacaoFeriado = (motivo?: string | null) =>
  !!motivo && motivo.trim().toLowerCase().startsWith("compensação de feriado");

export function termoCompensacaoParagrafos(
  tipo: TermoCompensacaoTipo,
  d: { empresa: string; cnpj?: string | null; nome: string; cpf?: string | null; horarios?: string[] },
): string[] {
  const partes = [
    `EMPREGADOR: ${d.empresa}${d.cnpj ? `, CNPJ ${d.cnpj}` : ""}.`,
    `EMPREGADO(A): ${d.nome}${d.cpf ? `, CPF ${d.cpf}` : ""}.`,
  ];
  if (tipo === "semanal") {
    return [
      ...partes,
      "1. Objeto. As partes ajustam, por acordo individual escrito, a compensação de horas dentro da mesma semana, nos termos do art. 59, § 6º, da CLT: o acréscimo de horas em alguns dias é compensado pela redução ou supressão do trabalho em outro dia da mesma semana.",
      ...(d.horarios?.length ? ["2. Jornada ajustada:", ...d.horarios.map((h) => `   - ${h}`)] : ["2. Jornada ajustada: conforme horário registrado na ficha do(a) empregado(a)."]),
      "3. Limites. A jornada diária não excederá 10 horas e a semanal não ultrapassará 44 horas, respeitados os intervalos legais (arts. 66, 67 e 71 da CLT).",
      "4. Horas não compensadas. As horas que excederem o limite semanal ou não forem compensadas na mesma semana serão pagas como extras, com o adicional legal ou convencional.",
      "5. Convenção coletiva. Este acordo observa a Convenção ou o Acordo Coletivo de Trabalho vigente da categoria, que prevalece no que for mais favorável.",
      "6. Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e impressão digital do arquivo.",
    ];
  }
  if (tipo === "banco_horas") {
    return [
      ...partes,
      "1. Objeto. As partes instituem banco de horas por acordo individual escrito (art. 59, § 5º, da CLT), em consonância com a Convenção ou o Acordo Coletivo de Trabalho vigente da categoria.",
      "2. Compensação. As horas trabalhadas além da jornada contratual serão compensadas com folgas ou redução de jornada no prazo máximo de 6 (seis) meses, ou no prazo menor fixado pela norma coletiva.",
      "3. Limites. A jornada diária não excederá 10 horas, respeitados os intervalos legais.",
      "4. Saldo não compensado. O saldo positivo não compensado no prazo, ou existente na rescisão, será pago como hora extra com o adicional legal ou convencional (art. 59, § 3º, da CLT).",
      "5. Transparência. O(A) empregado(a) poderá consultar o saldo do banco de horas junto ao Departamento Pessoal.",
      "6. Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020).",
    ];
  }
  return [
    ...partes,
    "1. Objeto. O(A) empregado(a) poderá ser escalado(a) para trabalhar em feriados, com a respectiva folga compensatória, conforme autorização da Convenção ou do Acordo Coletivo de Trabalho vigente da categoria e da legislação municipal (Lei 10.101/2000, art. 6º-A, e Lei 605/1949, art. 9º).",
    "2. Folga compensatória. Cada feriado trabalhado dá direito a um dia de folga compensatória, solicitada pelo portal do colaborador com a antecedência mínima definida pela empresa.",
    "3. Pedidos com prazo menor. Pedidos feitos com antecedência menor que a definida podem ser recusados conforme a necessidade da escala.",
    "4. Não compensação. O feriado trabalhado e não compensado será pago em dobro, salvo disposição mais favorável da norma coletiva.",
    "5. Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020).",
  ];
}

/** Termo do colaborador já emitido (qualquer status, exceto arquivado). */
export async function termoCompensacaoExistente(colaboradorId: string, tipo: TermoCompensacaoTipo) {
  const { data } = await supabase
    .from("dp_documentos")
    .select("id, aceite_status, created_at")
    .eq("colaborador_id", colaboradorId)
    .eq("tipo", "termos")
    .is("arquivado_em", null)
    .ilike("titulo", `${TERMOS_COMPENSACAO[tipo].titulo}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string; aceite_status?: string | null } | undefined) ?? null;
}

/** Emite o termo para assinatura no portal. Idempotente por colaborador e tipo. */
export async function emitirTermoCompensacao(input: {
  tipo: TermoCompensacaoTipo; companyId: string; colaboradorId: string; nome: string; cpf?: string | null; horarios?: string[];
}): Promise<"emitido" | "ja_existia"> {
  if (await termoCompensacaoExistente(input.colaboradorId, input.tipo)) return "ja_existia";
  const { titulo, versao } = TERMOS_COMPENSACAO[input.tipo];
  const { data: emp } = await supabase.from("companies").select("name, trade_name, cnpj").eq("id", input.companyId).maybeSingle();
  const empresa = (emp?.name || emp?.trade_name || "Empresa").toUpperCase();
  const paragrafos = termoCompensacaoParagrafos(input.tipo, {
    empresa, cnpj: emp?.cnpj ?? null, nome: input.nome.toUpperCase(), cpf: cpfFmt(input.cpf), horarios: input.horarios,
  });
  const bytes = await gerarPdf(titulo, versao, paragrafos, "A assinatura eletrônica do(a) empregado(a) é registrada no portal e estampada na via assinada.");
  const slug = input.nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const nomeArquivo = `acordo-${input.tipo.replace("_", "-")}-${slug}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nomeArquivo}`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Não foi possível guardar o arquivo do termo. Tente novamente em instantes.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo,
    descricao: `Versão ${versao}. Assinatura digital do colaborador pelo portal, com leitura prévia obrigatória.`,
    file_path: path,
    file_name: nomeArquivo,
    file_size: blob.size,
    mime_type: "application/pdf",
    referencia_data: new Date().toISOString().slice(0, 10),
    exige_aceite: true,
  } as never);
  return "emitido";
}
