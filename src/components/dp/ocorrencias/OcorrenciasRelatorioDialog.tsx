import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Printer, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { OCORRENCIAS_COLS, type Ocorrencia } from '@/hooks/useDpOcorrencias';
import { fetchAllPages } from '@/lib/supabase/fetchAllPages';
import { agruparRelatorio, calcularFechamentoContabil, csvRelatorio, diaSemana, formatarMinutos, linhasOcorrencia, variacaoOcorrencia, type PessoaRelatorio } from '@/lib/dp/ocorrencias-relatorio';
import { intervaloCompetencia } from '@/lib/dp/ocorrenciasPeriodo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import logo from '@/assets/aveto360-horizontal.png.asset.json';
import logoClaro from '@/assets/aveto360-horizontal-light.png.asset.json';
import './ocorrencias-relatorio.css';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; mes: string; corte: number; unidadeId: string; setorId: string; colaboradorId?: string }
const colunas = ['Data','Ocorrência','Previsto','Real','Justificativa','Decisão','Tratativa','Lançamento externo'];
export function OcorrenciasRelatorioDialog({ open, onOpenChange, mes, corte, unidadeId, setorId, colaboradorId }: Props) {
  const { selectedCompanyId, companies } = useCompanyContext();
  const [competencia, setCompetencia] = useState(mes);
  const [base, setBase] = useState('civil');
  const [modo, setModo] = useState('excecoes');
  const [pessoa, setPessoa] = useState(colaboradorId && colaboradorId !== 'all' ? colaboradorId : 'all');
  const [folhaIndividual, setFolhaIndividual] = useState(true);
  const [ano, numeroMes] = competencia.split('-').map(Number);
  const intervalo = intervaloCompetencia(ano, numeroMes, base === 'corte' ? corte : 0);
  const empresa = companies.find(c => c.id === selectedCompanyId)?.name ?? 'Empresa';
  const consulta = useQuery({
    queryKey: ['dp_ocorrencias_relatorio', selectedCompanyId, intervalo.inicio, intervalo.fim, unidadeId, setorId],
    enabled: open && !!selectedCompanyId && /^\d{4}-\d{2}$/.test(competencia),
    queryFn: async () => {
      if (!selectedCompanyId) throw new Error('Selecione uma empresa.');
      const [ocorrencias, pessoas] = await Promise.all([
        fetchAllPages<Ocorrencia>((from,to) => {
          let q = supabase.from('dp_ocorrencias').select(OCORRENCIAS_COLS).eq('company_id',selectedCompanyId).gte('data_operacional',intervalo.inicio).lte('data_operacional',intervalo.fim).neq('estado','cancelada').order('data_operacional').order('id');
          if (unidadeId !== 'all') q = q.eq('unidade_id', unidadeId);
          if (setorId !== 'all') q = q.eq('setor_id', setorId);
          return q.range(from,to) as unknown as PromiseLike<{ data: Ocorrencia[] | null; error: unknown }>;
        }),
        fetchAllPages<PessoaRelatorio>((from,to) => {
          let q = supabase.from('dp_colaboradores').select('id,nome,cargo,matricula').eq('company_id',selectedCompanyId).eq('ativo',true).order('nome').order('id');
          if (unidadeId !== 'all') q = q.eq('unidade_id', unidadeId);
          if (setorId !== 'all') q = q.eq('setor_id', setorId);
          return q.range(from,to);
        }),
      ]);
      return { ocorrencias, pessoas };
    },
  });
  const todosGrupos = useMemo(() => agruparRelatorio(consulta.data?.ocorrencias ?? [], consulta.data?.pessoas ?? [], modo === 'completo'), [consulta.data,modo]);
  const grupos = useMemo(() => pessoa === 'all' ? todosGrupos : todosGrupos.filter(g => g.pessoa.id === pessoa), [todosGrupos,pessoa]);
  const fechamento = useMemo(() => calcularFechamentoContabil(grupos.flatMap(g => g.ocorrencias)), [grupos]);
  const opcoesPessoa = useMemo(() => agruparRelatorio(consulta.data?.ocorrencias ?? [], consulta.data?.pessoas ?? [], true).map(g => g.pessoa), [consulta.data]);
  const competenciaLabel = competencia.split('-').reverse().join('/');
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const compartilhar = async () => {
    const texto = grupos.map(g => `${g.pessoa.nome}\n` + (g.ocorrencias.length ? g.ocorrencias.map(o => { const l = linhasOcorrencia(o); return `• ${l[0]} ${diaSemana(o.data_operacional)} — ${l[1]} — ${l[5]}`; }).join('\n') : '• Sem ocorrências no período')).join('\n\n');
    try { await navigator.share({ title: `Ocorrências ${competenciaLabel}`, text: `${empresa} · Ocorrências ${competenciaLabel}\n\n${texto}` }); } catch { /* cancelado pelo usuário */ }
  };
  const exportar = () => {
    const url = URL.createObjectURL(new Blob([csvRelatorio(grupos)],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download=`ocorrencias-${competencia}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const imprimir = async () => {
    const origem = document.getElementById('relatorio-ocorrencias');
    if (!origem) return;
    const frame = document.createElement('iframe'); frame.className=`ocorrencias-print-frame${folhaIndividual ? ' individual' : ''}`; frame.title='Impressão de ocorrências'; document.body.append(frame);
    const doc = frame.contentDocument; const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return; }
    doc.open(); doc.write('<!doctype html><html lang="pt-BR"><head></head><body></body></html>'); doc.close();
    for (const estilo of document.head.querySelectorAll('style,link[rel="stylesheet"]')) doc.head.append(estilo.cloneNode(true));
    doc.documentElement.className=document.documentElement.className.replace(/\bdark\b/g,'');
    doc.body.className='ocorrencias-print-body';
    const copia = origem.cloneNode(true) as HTMLElement; if (folhaIndividual) copia.classList.add('folha-individual'); doc.body.append(copia);
    await Promise.all([...doc.images].map(img => img.decode().catch(() => undefined)));
    win.addEventListener('afterprint',() => frame.remove(),{once:true}); win.focus(); win.print();
  };
  const pronto = !consulta.isPending && !consulta.isError && !!consulta.data;
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Relatório de Ponto do Mês" className="sm:max-w-6xl max-h-[92vh] overflow-y-auto" footer={<div className="flex w-full gap-2"><Button variant="outline" disabled={!pronto || !grupos.length} onClick={exportar} className="min-h-11 flex-1"><Download className="mr-2 h-4 w-4"/>CSV</Button>{podeCompartilhar && <Button variant="outline" disabled={!pronto || !grupos.length} onClick={() => void compartilhar()} className="min-h-11 flex-1" aria-label="Compartilhar relatório"><Share2 className="mr-2 h-4 w-4"/>Enviar</Button>}<Button disabled={!pronto || !grupos.length} onClick={() => void imprimir()} className="min-h-11 flex-1"><Printer className="mr-2 h-4 w-4"/>Imprimir / PDF</Button></div>}>
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-sm">Competência<Input aria-label="Competência do relatório" type="month" value={competencia} onChange={e => { if(e.target.value) setCompetencia(e.target.value); }}/></label>
      <label className="text-sm">Período<Select value={base} onValueChange={setBase}><SelectTrigger aria-label="Base do relatório"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="civil">Mês civil</SelectItem><SelectItem value="corte" disabled={!corte}>Corte cadastrado da empresa</SelectItem></SelectContent></Select></label>
      <label className="text-sm">Equipe<Select value={modo} onValueChange={setModo}><SelectTrigger aria-label="Equipe do relatório"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="excecoes">Apenas com ocorrências</SelectItem><SelectItem value="completo">Equipe completa</SelectItem></SelectContent></Select></label>
      <label className="text-sm">Colaborador<Select value={pessoa} onValueChange={setPessoa}><SelectTrigger aria-label="Colaborador do relatório"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{opcoesPessoa.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></label>
      <label className="text-sm">Impressão<Select value={folhaIndividual ? 'individual' : 'continua'} onValueChange={v => setFolhaIndividual(v === 'individual')}><SelectTrigger aria-label="Formato de impressão"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="individual">Folha por colaborador com assinatura</SelectItem><SelectItem value="continua">Lista contínua</SelectItem></SelectContent></Select></label>
    </div>
    {consulta.isPending ? <p role="status">Carregando relatório…</p> : consulta.isError ? <div role="alert"><p>Não foi possível carregar o relatório completo.</p><Button variant="outline" onClick={() => void consulta.refetch()}>Tentar novamente</Button></div> :
      <article id="relatorio-ocorrencias" className="space-y-5 text-foreground">
        <header className="space-y-1 border-b border-border pb-3"><img src={logoClaro.url} alt="AVETO 360" className="h-8 w-auto dark:hidden"/><img src={logo.url} alt="" aria-hidden className="hidden h-8 w-auto dark:block"/><h2 className="text-lg font-semibold">{empresa}</h2><p className="text-sm">Ocorrências · {intervalo.inicio.split('-').reverse().join('/')} a {intervalo.fim.split('-').reverse().join('/')}</p><p className="text-xs text-muted-foreground">{consulta.data?.ocorrencias.length ?? 0} ocorrências · {grupos.length} colaboradores · Emitido em {new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p></header>
        <section aria-label="Quadro de fechamento" className="ocorrencias-fechamento grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Horas a descontar', formatarMinutos(fechamento.minutosDesconto)], ['Faltas a descontar', String(fechamento.faltasDesconto)], ['Horas abonadas/compensadas', formatarMinutos(fechamento.minutosAbonados)], ['Perdem assiduidade', String(fechamento.perdeAssiduidade)], ['Descontam férias', String(fechamento.descontaFerias)], ['Dias de férias', String(fechamento.diasFerias)], ['Folgas/trocas autorizadas', String(fechamento.diasDescanso)], ['Pendências', String(fechamento.pendencias)]].map(([rotulo, valor]) => <div key={rotulo} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-base font-semibold tabular-nums">{valor}</p></div>)}
        </section>
        {fechamento.pendencias > 0 && <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden/>Existem {fechamento.pendencias} {fechamento.pendencias === 1 ? 'ocorrência pendente' : 'ocorrências pendentes'} de decisão antes do fechamento.</p>}
        {!grupos.length && <p>Nenhuma ocorrência no período.</p>}
        {grupos.map(g => <section key={g.pessoa.id} className="ocorrencias-print-grupo space-y-2">
          <h3 className="font-semibold">{g.pessoa.nome}</h3>
          <p className="text-xs text-muted-foreground">{g.pessoa.cargo ?? 'Cargo não informado'}{g.pessoa.matricula ? ` · Matrícula ${g.pessoa.matricula}` : ''}</p>
          {!g.ocorrencias.length ? <p className="text-sm">Sem ocorrências no período.</p> : <>
            <ul className="ocorrencias-cards space-y-2 md:hidden">{g.ocorrencias.map(o => { const l = linhasOcorrencia(o); const v = variacaoOcorrencia(o); return <li key={o.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{l[0].slice(0,5)} · {diaSemana(o.data_operacional)}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l[1]}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Previsto: {l[2]}</span><span>Real: {l[3]}</span>{v && <span className="rounded-full border border-border px-2 py-0.5 text-foreground">{v}</span>}</div>
              {l[4] && <p className="mt-1 break-words text-xs">{l[4]}</p>}
              <div className="mt-2 flex flex-wrap gap-1 text-xs"><span className="rounded-full border border-border px-2 py-0.5">{l[5]}</span><span className="rounded-full border border-border px-2 py-0.5">{l[6]}</span>{o.impacta_assiduidade === 'sim' && <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">Perde assiduidade</span>}{o.impacta_ferias === 'sim' && <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">Desconta férias</span>}<span className="rounded-full border border-border px-2 py-0.5">{l[7]}</span></div>
            </li>; })}</ul>
            <div className="ocorrencias-tabela hidden md:block"><table className="ocorrencias-print-table w-full text-left text-xs"><thead><tr>{colunas.map(c => <th className="border-b border-border p-2" key={c}>{c}</th>)}</tr></thead><tbody>{g.ocorrencias.map(o => <tr key={o.id}>{linhasOcorrencia(o).map((v,i) => <td key={i} className="border-b border-border p-2 align-top break-words">{v}{i===0 && <span className="block text-muted-foreground">{diaSemana(o.data_operacional)}</span>}{i===3 && variacaoOcorrencia(o) && <span className="block text-muted-foreground">{variacaoOcorrencia(o)}</span>}</td>)}</tr>)}</tbody></table></div>
          </>}
          <div className="ocorrencias-assinatura"><p>Reconheço a exatidão das ocorrências e justificativas acima apuradas referentes à competência {competenciaLabel}.</p><p>Assinatura do colaborador: ______________________________ Data: ___/___/______</p></div>
        </section>)}
      </article>}
  </ResponsiveDialog>;
}