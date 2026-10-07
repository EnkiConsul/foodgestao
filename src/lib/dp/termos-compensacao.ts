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

/** Trecho do título que identifica cada assunto, inclusive dentro do termo único. */
const CHAVE_TITULO: Record<TermoCompensacaoTipo, string> = {
  semanal: "Compensação Semanal", banco_horas: "Banco de Horas", feriados: "Feriados",
};

const ORDEM_TIPOS: TermoCompensacaoTipo[] = ["semanal", "banco_horas", "feriados"];
const ASSUNTO: Record<TermoCompensacaoTipo, string> = {
  semanal: "Compensação Semanal de Horas", banco_horas: "Banco de Horas", feriados: "Trabalho e Compensação em Feriados",
};

/** Título do termo: um assunto usa o título próprio; vários viram o termo único. */
export function tituloTermoUnificado(tipos: TermoCompensacaoTipo[]): string {
  const t = ORDEM_TIPOS.filter((x) => tipos.includes(x));
  if (t.length === 1) return TERMOS_COMPENSACAO[t[0]].titulo;
  const nomes = t.map((x) => ASSUNTO[x]);
  return `Acordo Individual de ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Cláusulas do termo único (semanal, banco e feriados em um só instrumento), renumeradas. */
export function clausulasUnificadas(tipos: TermoCompensacaoTipo[]): string[] {
  const t = ORDEM_TIPOS.filter((x) => tipos.includes(x));
  if (t.length === 1) return clausulasCompensacao(t[0], {});
  const sem = (c: string) => c.replace(/^\d+\.\s*/, "");
  const corpo: string[] = [];
  const temSemanal = t.includes("semanal"), temBanco = t.includes("banco_horas");
  if (temSemanal) {
    const s = clausulasCompensacao("semanal", { integrarBanco: temBanco });
    corpo.push(...s.slice(0, temBanco ? 5 : 3).map(sem));
  } else if (temBanco) {
    corpo.push(...termoCompensacaoParagrafos("banco_horas", { empresa: "", nome: "" }).slice(2, 7).map(sem));
  }
  if (t.includes("feriados")) {
    corpo.push(...termoCompensacaoParagrafos("feriados", { empresa: "", nome: "" }).slice(2, 6).map(sem)
      .map((c) => c.startsWith("Objeto.") ? c.replace("Objeto.", "Feriados.") : c));
  }
  corpo.push(
    "Convenção coletiva. Este acordo observa a Convenção ou o Acordo Coletivo de Trabalho vigente da categoria, que prevalece no que for mais favorável.",
    "Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e impressão digital do arquivo, e o desenho da assinatura é estampado na via assinada.",
  );
  return corpo.map((c, i) => `${i + 1}. ${c}`);
}

/** Termo do colaborador já emitido (não arquivado) e se já foi assinado. */
export async function termoCompensacaoExistente(colaboradorId: string, tipo: TermoCompensacaoTipo) {
  const { data } = await supabase
    .from("dp_documentos")
    .select("id, titulo")
    .eq("colaborador_id", colaboradorId)
    .eq("tipo", "termos")
    .is("arquivado_em", null)
    .ilike("titulo", `%${CHAVE_TITULO[tipo]}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  const doc = (data?.[0] as { id: string; titulo: string } | undefined) ?? null;
  if (!doc) return null;
  const { data: ac } = await (supabase as any)
    .from("dp_documento_aceites").select("aceito_em").eq("documento_id", doc.id).limit(1);
  return { id: doc.id, titulo: doc.titulo, assinado: !!ac?.[0]?.aceito_em };
}

export const TITULO_SEMANAL_BANCO = "Acordo Individual de Compensação Semanal de Horas e Banco de Horas";

/** Cláusulas editáveis da prévia (sem partes nem quadro, que o PDF monta). */
export function clausulasCompensacao(tipo: TermoCompensacaoTipo, opts: { integrarBanco?: boolean } = {}): string[] {
  const assinatura = "Assinatura eletrônica. As partes reconhecem a validade da assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). O sistema registra data, hora, endereço de internet, dispositivo e impressão digital do arquivo, e o desenho da assinatura é estampado na via assinada.";
  if (tipo === "semanal") {
    const c = [
      "1. Objeto. As partes ajustam, por acordo individual escrito, a compensação de horas dentro da mesma semana (art. 59, § 6º, da CLT): o acréscimo de horas em alguns dias é compensado pela redução ou supressão do trabalho em outro dia da mesma semana, conforme o quadro acima.",
      "2. Limites. A jornada diária não excederá 10 horas e a semanal não ultrapassará 44 horas, respeitados os intervalos legais e o descanso semanal remunerado indicado no quadro (arts. 66, 67 e 71 da CLT).",
    ];
    if (opts.integrarBanco) {
      c.push(
        "3. Banco de horas. As horas excedentes que não forem compensadas na mesma semana integrarão o banco de horas (art. 59, §§ 2º e 5º, da CLT), em consonância com a Convenção ou o Acordo Coletivo de Trabalho vigente, e serão compensadas com folgas ou redução de jornada no prazo máximo de 6 (seis) meses, ou no prazo menor fixado pela norma coletiva.",
        "4. Saldo não compensado. O saldo positivo não compensado no prazo, ou existente na rescisão, será pago como hora extra com o adicional legal ou convencional (art. 59, § 3º, da CLT).",
        "5. Transparência. O(A) empregado(a) poderá consultar o saldo do banco de horas junto ao Departamento Pessoal.",
        "6. Convenção coletiva. Este acordo observa a norma coletiva vigente da categoria, que prevalece no que for mais favorável.",
        `7. ${assinatura}`,
      );
    } else {
      c.push(
        "3. Horas não compensadas. As horas que excederem o limite semanal ou não forem compensadas na mesma semana serão pagas como extras, com o adicional legal ou convencional, salvo se houver banco de horas ajustado por escrito ou previsto em norma coletiva, hipótese em que integrarão o saldo para compensação no prazo convencional.",
        "4. Convenção coletiva. Este acordo observa a Convenção ou o Acordo Coletivo de Trabalho vigente da categoria, que prevalece no que for mais favorável.",
        `5. ${assinatura}`,
      );
    }
    return c;
  }
  return termoCompensacaoParagrafos(tipo, { empresa: "", nome: "" }).slice(2).map((t) =>
    t.startsWith("5. Assinatura") || t.startsWith("6. Assinatura") ? `${t.slice(0, 3)}${assinatura}` : t);
}

/** Emite o termo revisado na prévia para assinatura no portal. Idempotente por colaborador e tipo. */
export async function emitirTermoCompensacao(input: {
  tipo: TermoCompensacaoTipo; companyId: string; colaboradorId: string;
  titulo: string; bytes: Uint8Array; integrarBanco?: boolean; tipos?: TermoCompensacaoTipo[];
}): Promise<"emitido" | "ja_existia"> {
  for (const t of input.tipos ?? [input.tipo]) {
    if (await termoCompensacaoExistente(input.colaboradorId, t)) return "ja_existia";
  }
  const versao = TERMOS_COMPENSACAO[input.tipo].versao.replace("v1", "v2");
  const nomeArquivo = (input.tipos?.length ?? 0) > 1
    ? `acordo-unico-${input.tipos!.map((t) => t.replace("_", "-")).join("-")}.pdf`
    : `acordo-${input.tipo.replace("_", "-")}${input.integrarBanco ? "-banco-horas" : ""}.pdf`;
  const path = `${input.companyId}/${input.colaboradorId}/${Date.now()}-${nomeArquivo}`;
  const blob = new Blob([input.bytes as BlobPart], { type: "application/pdf" });
  const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Não foi possível guardar o arquivo do termo. Tente novamente em instantes.");
  await registrarDocumento({
    company_id: input.companyId,
    colaborador_id: input.colaboradorId,
    tipo: "termos",
    titulo: input.titulo,
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

/**
 * Acordos de compensação (semanal, banco de horas, feriados) só valem para
 * contrato com carteira assinada e jornada fixa: CLT e temporário.
 * Intermitente (horas por convocação), estágio, PJ, MEI, freelancer e sócio ficam fora.
 */
export function vinculoAdmiteCompensacao(regime?: string | null, vinculoLabel?: string | null): boolean {
  const v = String(vinculoLabel ?? "").trim().toLowerCase();
  if (v === "socio" || v === "sócio") return false;
  const r = String(regime ?? "clt").toLowerCase();
  return r === "clt" || r === "temporario";
}
