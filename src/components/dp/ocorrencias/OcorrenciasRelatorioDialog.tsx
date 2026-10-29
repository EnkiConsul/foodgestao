import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { OCORRENCIAS_COLS, type Ocorrencia } from '@/hooks/useDpOcorrencias';
import { fetchAllPages } from '@/lib/supabase/fetchAllPages';
import { agruparRelatorio, csvRelatorio, linhasOcorrencia, type PessoaRelatorio } from '@/lib/dp/ocorrencias-relatorio';
import { intervaloCompetencia } from '@/lib/dp/ocorrenciasPeriodo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import logo from '@/assets/aveto360-horizontal.png.asset.json';
import './ocorrencias-relatorio.css';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; mes: string; corte: number; unidadeId: string; setorId: string }
const colunas = ['Data','Ocorrência','Previsto','Real','Justificativa','Decisão','Tratativa','Lançamento externo'];
export function OcorrenciasRelatorioDialog({ open, onOpenChange, mes, corte, unidadeId, setorId }: Props) {
  const { selectedCompanyId, companies } = useCompanyContext();
  const [competencia, setCompetencia] = useState(mes);
  const [base, setBase] = useState('civil');
  const [modo, setModo] = useState('excecoes');
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
  const grupos = useMemo(() => agruparRelatorio(consulta.data?.ocorrencias ?? [], consulta.data?.pessoas ?? [], modo === 'completo'), [consulta.data,modo]);
  const exportar = () => {
    const url = URL.createObjectURL(new Blob([csvRelatorio(grupos)],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download=`ocorrencias-${competencia}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const imprimir = async () => {
    const origem = document.getElementById('relatorio-ocorrencias');
    if (!origem) return;
    const frame = document.createElement('iframe'); frame.className='ocorrencias-print-frame'; frame.title='Impressão de ocorrências'; document.body.append(frame);
    const doc = frame.contentDocument; const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return; }
    doc.open(); doc.write('<!doctype html><html lang="pt-BR"><head></head><body></body></html>'); doc.close();
    for (const estilo of document.head.querySelectorAll('style,link[rel="stylesheet"]')) doc.head.append(estilo.cloneNode(true));
    doc.documentElement.className=document.documentElement.className;
    doc.body.append(origem.cloneNode(true));
    await Promise.all([...doc.images].map(img => img.decode().catch(() => undefined)));
    win.addEventListener('afterprint',() => frame.remove(),{once:true}); win.focus(); win.print();
  };
  const pronto = !consulta.isPending && !consulta.isError && !!consulta.data;
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Relatório de Ponto do Mês" className="sm:max-w-6xl max-h-[92vh] overflow-y-auto" footer={<div className="flex w-full gap-2"><Button variant="outline" disabled={!pronto || !grupos.length} onClick={exportar} className="min-h-11 flex-1"><Download className="mr-2 h-4 w-4"/>CSV</Button><Button disabled={!pronto || !grupos.length} onClick={() => void imprimir()} className="min-h-11 flex-1"><Printer className="mr-2 h-4 w-4"/>Imprimir / PDF</Button></div>}>
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-sm">Competência<Input aria-label="Competência do relatório" type="month" value={competencia} onChange={e => { if(e.target.value) setCompetencia(e.target.value); }}/></label>
      <label className="text-sm">Período<Select value={base} onValueChange={setBase}><SelectTrigger aria-label="Base do relatório"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="civil">Mês civil</SelectItem><SelectItem value="corte" disabled={!corte}>Corte cadastrado da empresa</SelectItem></SelectContent></Select></label>
      <label className="text-sm">Equipe<Select value={modo} onValueChange={setModo}><SelectTrigger aria-label="Equipe do relatório"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="excecoes">Apenas com ocorrências</SelectItem><SelectItem value="completo">Equipe completa</SelectItem></SelectContent></Select></label>
    </div>
    {consulta.isPending ? <p role="status">Carregando relatório…</p> : consulta.isError ? <div role="alert"><p>Não foi possível carregar o relatório completo.</p><Button variant="outline" onClick={() => void consulta.refetch()}>Tentar novamente</Button></div> :
      <article id="relatorio-ocorrencias" className="space-y-5 text-foreground">
        <header className="space-y-1 border-b border-border pb-3"><img src={logo.url} alt="AVETO 360" className="h-8 w-auto"/><h2 className="text-lg font-semibold">{empresa}</h2><p className="text-sm">Ocorrências · {intervalo.inicio.split('-').reverse().join('/')} a {intervalo.fim.split('-').reverse().join('/')}</p><p className="text-xs text-muted-foreground">{consulta.data?.ocorrencias.length ?? 0} ocorrências · {grupos.length} colaboradores · Emitido em {new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p></header>
        {!grupos.length && <p>Nenhuma ocorrência no período.</p>}
        {grupos.map(g => <section key={g.pessoa.id} className="ocorrencias-print-grupo space-y-2"><h3 className="font-semibold">{g.pessoa.nome}</h3><p className="text-xs text-muted-foreground">{g.pessoa.cargo ?? 'Cargo não informado'}{g.pessoa.matricula ? ` · Matrícula ${g.pessoa.matricula}` : ''}</p>{!g.ocorrencias.length ? <p className="text-sm">Sem ocorrências no período.</p> : <div className="overflow-x-auto"><table className="ocorrencias-print-table w-full min-w-[850px] text-left text-xs"><thead><tr>{colunas.map(c => <th className="border-b border-border p-2" key={c}>{c}</th>)}</tr></thead><tbody>{g.ocorrencias.map(o => <tr key={o.id}>{linhasOcorrencia(o).map((v,i) => <td key={i} className="border-b border-border p-2 align-top break-words">{v}{i===0 && <span className="block text-muted-foreground">{new Date(`${o.data_operacional}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'})}</span>}</td>)}</tr>)}</tbody></table></div>}</section>)}
      </article>}
  </ResponsiveDialog>;
}