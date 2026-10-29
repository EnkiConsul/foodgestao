import type { Ocorrencia } from '@/hooks/useDpOcorrencias';
import { DECISAO_TRATATIVA_LABEL, rotuloTipoOcorrencia, TRATATIVA_LABEL, tratativaPendente } from './ocorrencias';
export interface PessoaRelatorio { id: string; nome: string; cargo?: string | null; matricula?: string | null }
export interface GrupoRelatorio { pessoa: PessoaRelatorio; ocorrencias: Ocorrencia[] }
export function agruparRelatorio(ocorrencias: Ocorrencia[], pessoas: PessoaRelatorio[] = [], completo = false): GrupoRelatorio[] {
  const mapa = new Map<string, GrupoRelatorio>();
  if (completo) for (const pessoa of pessoas) mapa.set(pessoa.id, { pessoa, ocorrencias: [] });
  for (const o of ocorrencias) {
    if (o.estado === 'cancelada') continue;
    const grupo = mapa.get(o.colaborador_id) ?? { pessoa: pessoas.find(p => p.id === o.colaborador_id) ?? { id: o.colaborador_id, nome: o.colaborador?.nome ?? 'Colaborador', cargo: o.colaborador?.cargo }, ocorrencias: [] };
    grupo.ocorrencias.push(o); mapa.set(o.colaborador_id, grupo);
  }
  return [...mapa.values()].sort((a,b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR')).map(g => ({ ...g, ocorrencias: g.ocorrencias.sort((a,b) => a.data_operacional.localeCompare(b.data_operacional) || a.id.localeCompare(b.id)) }));
}
export function linhasOcorrencia(o: Ocorrencia): string[] {
  const descanso = ehDescansoAutorizado(o);
  const hora = (h: string | null) => h?.slice(0,5) ?? (descanso ? '—' : 'Não informado');
  const previsto = descanso && !o.previsto_entrada && !o.previsto_saida ? '—' : `${hora(o.previsto_entrada)} — ${hora(o.previsto_saida)}`;
  return [o.data_operacional.split('-').reverse().join('/'), rotuloTipoOcorrencia(o), previsto, hora(o.horario_real), [o.justificativa_inicial, o.justificativa_final].filter(Boolean).join(' | '), o.tratativa_decisao ? DECISAO_TRATATIVA_LABEL[o.tratativa_decisao] ?? o.tratativa_decisao : 'Sem decisão registrada', TRATATIVA_LABEL[o.tratativa_status], o.lancado_ponto_em ? 'Lançado' : 'Não registrado'];
}
export function csvRelatorio(grupos: GrupoRelatorio[]): string {
  const seguro = (v: string) => `"${(/^[\s]*[=+@-]/.test(v) ? "'" : '') + v.replace(/"/g, '""')}"`;
  const linhas = [['Colaborador','Cargo','Matrícula','Data','Dia da semana','Ocorrência','Jornada prevista','Horário real','Minutos de desvio','Justificativa','Decisão','Tratativa','Perde assiduidade','Desconta férias','Lançamento externo']];
  const imp = (v: string | null | undefined) => (v ? IMPACTO_LABEL[v] ?? v : '');
  for (const g of grupos) {
    if (!g.ocorrencias.length) linhas.push([g.pessoa.nome,g.pessoa.cargo ?? '',g.pessoa.matricula ?? '', '', '', 'Sem ocorrências no período','','','','','','','','','']);
    for (const o of g.ocorrencias) { const l = linhasOcorrencia(o); linhas.push([g.pessoa.nome,g.pessoa.cargo ?? '',g.pessoa.matricula ?? '',l[0],diaSemana(o.data_operacional),l[1],l[2],l[3],o.minutos != null && !ehDescansoAutorizado(o) ? String(o.minutos) : '',l[4],l[5],l[6],imp(o.impacta_assiduidade),imp(o.impacta_ferias),l[7]]); }
  }
  return '\uFEFF' + linhas.map(l => l.map(seguro).join(';')).join('\r\n');
}
export function agruparFeriasLista(lista: Ocorrencia[]): { normais: Ocorrencia[]; ferias: Ocorrencia[][] } {
  const grupos = new Map<string, Ocorrencia[]>(); const normais: Ocorrencia[] = [];
  for (const o of lista) {
    if (o.subtipo !== 'ferias') { normais.push(o); continue; }
    const key = `${o.colaborador_id}:${o.ferias_gozo_id ?? o.id}:${o.estado}`;
    const g = grupos.get(key) ?? []; g.push(o); grupos.set(key,g);
  }
  return { normais, ferias: [...grupos.values()].map(g => g.sort((a,b) => a.data_operacional.localeCompare(b.data_operacional))) };
}
/** Feed em ordem: férias agrupadas por período; demais ocorrências de dias seguidos, mesmo colaborador, tipo e motivo viram um bloco (relatório segue dia a dia). Faltas injustificadas ficam separadas. */
export type ItemFeed = { tipo: 'ocorrencia'; o: Ocorrencia } | { tipo: 'ferias' | 'bloco'; grupo: Ocorrencia[] };
const diaNum = (d: string) => Math.round(Date.parse(d + 'T12:00:00Z') / 86400000);
export function feedOrdenadoComFerias(lista: Ocorrencia[]): ItemFeed[] {
  const abertos = new Map<string, { item: Extract<ItemFeed, { grupo: Ocorrencia[] }>; min: number; max: number }>(); const itens: ItemFeed[] = [];
  for (const o of lista) {
    const ferias = o.subtipo === 'ferias';
    if (!ferias && o.tipo === 'falta' && !o.justificativa_inicial) { itens.push({ tipo: 'ocorrencia', o }); continue; }
    const key = ferias ? `f:${o.colaborador_id}:${o.ferias_gozo_id ?? o.id}:${o.estado}` : `b:${o.colaborador_id}:${o.tipo}:${o.subtipo ?? ''}:${o.estado}:${o.tratativa_status}:${(o.justificativa_inicial ?? '').trim().toLowerCase()}`;
    const n = diaNum(o.data_operacional); const g = abertos.get(key);
    if (g && (ferias || n === g.min - 1 || n === g.max + 1)) { g.item.grupo.push(o); g.min = Math.min(g.min, n); g.max = Math.max(g.max, n); continue; }
    const item = { tipo: ferias ? 'ferias' as const : 'bloco' as const, grupo: [o] }; abertos.set(key, { item, min: n, max: n }); itens.push(item);
  }
  for (const it of itens) if (it.tipo !== 'ocorrencia') it.grupo.sort((a,b) => a.data_operacional.localeCompare(b.data_operacional));
  return itens.map(it => it.tipo === 'bloco' && it.grupo.length === 1 ? { tipo: 'ocorrencia', o: it.grupo[0] } : it);
}
const IMPACTO_LABEL: Record<string, string> = { sim: 'Sim', nao: 'Não', aguardando: 'Aguardando decisão' };
const SUBTIPOS_DESCANSO = new Set(['ferias','troca_folga','compensacao_feriado','banco_horas_aviso','dispensa_aviso_art488','folga_compensatoria','folga_extra','folga_fixa_deslocada']);
/** Férias, folgas e trocas autorizadas: não há jornada a conferir nem horário a informar. */
export function ehDescansoAutorizado(o: Pick<Ocorrencia,'subtipo'|'folga_id'|'tipo'>): boolean {
  if (o.subtipo === 'troca_trabalho') return false;
  return SUBTIPOS_DESCANSO.has(o.subtipo ?? '') || (!!o.folga_id && o.tipo !== 'falta');
}
export function diaSemana(data: string): string {
  const d = new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','');
  return d.charAt(0).toUpperCase() + d.slice(1);
}
export function formatarMinutos(min: number): string {
  const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
  return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}m`;
}
/** Variação registrada, sem inventar sinal: só existe quando a ocorrência tem minutos apurados. */
export function variacaoOcorrencia(o: Ocorrencia): string | null {
  if (o.minutos == null || o.minutos === 0 || ehDescansoAutorizado(o)) return null;
  const h = Math.floor(Math.abs(o.minutos) / 60), m = Math.abs(o.minutos) % 60;
  return `${o.minutos < 0 ? '-' : '+'}${h ? `${h}h ` : ''}${m}min`.trim();
}
export interface FechamentoContabil { minutosDesconto: number; faltasDesconto: number; minutosAbonados: number; perdeAssiduidade: number; descontaFerias: number; diasFerias: number; diasDescanso: number; pendencias: number }
/** Totais do fechamento. Só decisões persistidas contam como desconto/abono; nada é presumido. */
export function calcularFechamentoContabil(ocorrencias: Ocorrencia[]): FechamentoContabil {
  const r: FechamentoContabil = { minutosDesconto: 0, faltasDesconto: 0, minutosAbonados: 0, perdeAssiduidade: 0, descontaFerias: 0, diasFerias: 0, diasDescanso: 0, pendencias: 0 };
  for (const o of ocorrencias) {
    if (o.estado === 'cancelada') continue;
    if (o.subtipo === 'ferias') { r.diasFerias++; continue; }
    if (ehDescansoAutorizado(o)) { r.diasDescanso++; continue; }
    if (o.tratativa_status === 'pendente' && tratativaPendente(o)) r.pendencias++;
    const min = Math.abs(o.minutos ?? 0);
    if (o.tratativa_decisao === 'desconto') { if (o.tipo === 'falta') r.faltasDesconto++; else r.minutosDesconto += min; }
    if (o.tratativa_decisao === 'abono' || o.tratativa_decisao === 'compensacao') r.minutosAbonados += min;
    if (o.impacta_assiduidade === 'sim') r.perdeAssiduidade++;
    if (o.impacta_ferias === 'sim') r.descontaFerias++;
  }
  return r;
}
