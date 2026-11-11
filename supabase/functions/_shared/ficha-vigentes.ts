/**
 * Salário e cargo VIGENTES da ficha de registro.
 *
 * A ficha da contabilidade traz o salário e o cargo da contratação e, em outro
 * quadro, as alterações posteriores. O cadastro precisa do que vale hoje: a
 * alteração com a data mais recente substitui o dado da admissão, e o valor da
 * admissão fica guardado em `salario_admissao` / `cargo_admissao` para conferência.
 *
 * Função pura, sem dependência de Deno ou do navegador: usada pela leitura no
 * servidor e pelos testes do app.
 */

// deno-lint-ignore no-explicit-any
type Dados = Record<string, any>;

function dataIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

/** "1.708,64", "1708.64", 1708.64 → 1708.64 (null quando não é valor positivo). */
export function valorMonetario(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  let t = String(v).replace(/[^\d,.-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function lista(v: unknown): Dados[] {
  return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Aplica a alteração mais recente de salário e de cargo. Alteração sem data
 * legível ou anterior à admissão não substitui nada (não dá para saber se vale).
 */
export function aplicarAlteracoesVigentes(entrada: Dados): Dados {
  const d: Dados = { ...entrada };
  const admissao = dataIso(d.data_admissao);

  const salarios = lista(d.alteracoes_salario)
    .map((a) => ({ data: dataIso(a.data), valor: valorMonetario(a.salario) }))
    .filter((a): a is { data: string; valor: number } => !!a.data && a.valor !== null && (!admissao || a.data >= admissao))
    .sort((a, b) => a.data.localeCompare(b.data));
  const ultSal = salarios[salarios.length - 1];
  const vigenciaSalAtual = dataIso(d.salario_vigencia);
  if (ultSal && (!vigenciaSalAtual || ultSal.data >= vigenciaSalAtual)) {
    const atual = valorMonetario(d.salario);
    if (d.salario_admissao == null && atual !== null && atual !== ultSal.valor && !vigenciaSalAtual) {
      d.salario_admissao = atual;
    }
    d.salario = ultSal.valor;
    d.salario_vigencia = ultSal.data;
  }

  const cargos = lista(d.alteracoes_cargo)
    .map((a) => ({ data: dataIso(a.data), cargo: texto(a.cargo), cbo: texto(a.cbo) }))
    .filter((a): a is { data: string; cargo: string; cbo: string | null } => !!a.data && !!a.cargo && (!admissao || a.data >= admissao))
    .sort((a, b) => a.data.localeCompare(b.data));
  const ultCargo = cargos[cargos.length - 1];
  const vigenciaCargoAtual = dataIso(d.cargo_vigencia);
  if (ultCargo && (!vigenciaCargoAtual || ultCargo.data >= vigenciaCargoAtual)) {
    const atual = texto(d.cargo_nome);
    const mudou = !atual || atual.toUpperCase() !== ultCargo.cargo.toUpperCase();
    if (mudou && atual && d.cargo_admissao == null && !vigenciaCargoAtual) {
      d.cargo_admissao = atual;
      if (texto(d.cbo)) d.cbo_admissao = texto(d.cbo);
    }
    d.cargo_nome = ultCargo.cargo;
    d.cargo_vigencia = ultCargo.data;
    // O CBO acompanha o cargo: o da admissão não vale para a função nova.
    if (ultCargo.cbo) d.cbo = ultCargo.cbo;
    else if (mudou) d.cbo = null;
  }
  return d;
}
