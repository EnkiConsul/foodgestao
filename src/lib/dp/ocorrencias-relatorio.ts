import type { Ocorrencia } from '@/hooks/useDpOcorrencias';
import { DECISAO_TRATATIVA_LABEL, rotuloTipoOcorrencia, TRATATIVA_LABEL } from './ocorrencias';
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
  const hora = (h: string | null) => h?.slice(0,5) ?? 'Não informado';
  return [o.data_operacional.split('-').reverse().join('/'), rotuloTipoOcorrencia(o), `${hora(o.previsto_entrada)} — ${hora(o.previsto_saida)}`, hora(o.horario_real), [o.justificativa_inicial, o.justificativa_final].filter(Boolean).join(' | '), o.tratativa_decisao ? DECISAO_TRATATIVA_LABEL[o.tratativa_decisao] ?? o.tratativa_decisao : 'Sem decisão registrada', TRATATIVA_LABEL[o.tratativa_status], o.lancado_ponto_em ? 'Lançado' : 'Não registrado'];
}
export function csvRelatorio(grupos: GrupoRelatorio[]): string {
  const seguro = (v: string) => `"${(/^[\s]*[=+@-]/.test(v) ? "'" : '') + v.replaceAll('"', '""')}"`;
  const linhas = [['Colaborador','Cargo','Matrícula','Data','Ocorrência','Jornada prevista','Horário real','Justificativa','Decisão','Tratativa','Lançamento externo']];
  for (const g of grupos) {
    if (!g.ocorrencias.length) linhas.push([g.pessoa.nome,g.pessoa.cargo ?? '',g.pessoa.matricula ?? '', '', 'Sem ocorrências no período','','','','','','']);
    for (const o of g.ocorrencias) linhas.push([g.pessoa.nome,g.pessoa.cargo ?? '',g.pessoa.matricula ?? '',...linhasOcorrencia(o)]);
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