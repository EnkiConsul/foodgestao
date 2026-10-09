import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";
import { useCliente360Lista } from "@/hooks/useCliente360";
import {
  C360Conta, MODULOS, assinaturaDoModulo, brl, cortesiaVence30, dataBR, ehCliente, emCortesia, idCurto,
  modulosAtivos, mrrPotencial, semAcessoV2, semAssinatura, temEmpresa, STATUS_LABEL,
} from "@/lib/admin/cliente360";
import { Cliente360Drawer } from "@/components/admin/cliente360/Cliente360Drawer";

type Filtro =
  | "clientes" | "cortesia" | "cortesia30" | "carencia" | "inadimplentes" | "um_modulo"
  | "sem_assinatura" | "sem_acesso" | "internas" | "encerradas";

const FILTROS: { v: Filtro; l: string }[] = [
  { v: "clientes", l: "Clientes (padrão)" },
  { v: "cortesia", l: "Em cortesia" },
  { v: "cortesia30", l: "Cortesia vencendo em 30 dias" },
  { v: "carencia", l: "Em carência" },
  { v: "inadimplentes", l: "Inadimplentes" },
  { v: "um_modulo", l: "Apenas 1 módulo" },
  { v: "sem_assinatura", l: "Sem assinatura" },
  { v: "sem_acesso", l: "Sem acesso no modelo V2" },
  { v: "internas", l: "Internas" },
  { v: "encerradas", l: "Encerradas/sem empresa" },
];

export function ModuloCelula({ c, mod }: { c: C360Conta; mod: string }) {
  const s = assinaturaDoModulo(c, mod);
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  const enc = s.status === "canceled" || s.status === "expired";
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{s.plano.replace(/^(Financeiro|Pessoas) 360° /, "")}</div>
      <div className="flex flex-wrap gap-1">
        <Badge variant={enc ? "destructive" : s.status === "grace" ? "secondary" : "outline"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
        {emCortesia(s) && <Badge variant="secondary">Cortesia {s.exempt_until ? `até ${dataBR(s.exempt_until)}` : "sem prazo"}</Badge>}
        {s.status === "grace" && s.grace_ends_at && <Badge variant="secondary">Até {dataBR(s.grace_ends_at)}</Badge>}
      </div>
      {mod === "pessoas" && !enc && (
        <div className="text-muted-foreground">Colaboradores: {s.colab_uso ?? c.colaboradores_ativos} / {s.colab_limite ?? "—"}</div>
      )}
    </div>
  );
}

export default function AdminClientes() {
  const { data: contas = [], isLoading, error } = useCliente360Lista();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("clientes");
  const [modulo, setModulo] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [aberta, setAberta] = useState<string | null>(null);

  const resumo = useMemo(() => ({
    clientes: contas.filter(ehCliente).length,
    internas: contas.filter((c) => c.is_internal).length,
    semAssinatura: contas.filter((c) => semAssinatura(c) && !c.is_internal).length,
    encerradas: contas.filter((c) => !temEmpresa(c)).length,
    mrr: contas.filter(ehCliente).reduce((t, c) => t + mrrPotencial(c), 0),
  }), [contas]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, "");
    return contas.filter((c) => {
      const ok: Record<Filtro, boolean> = {
        clientes: ehCliente(c),
        cortesia: temEmpresa(c) && c.assinaturas.some(emCortesia),
        cortesia30: temEmpresa(c) && cortesiaVence30(c),
        carencia: temEmpresa(c) && c.assinaturas.some((s) => s.status === "grace"),
        inadimplentes: c.inadimplente,
        um_modulo: ehCliente(c) && modulosAtivos(c) === 1,
        sem_assinatura: semAssinatura(c),
        sem_acesso: semAcessoV2(c),
        internas: c.is_internal,
        encerradas: !temEmpresa(c),
      };
      if (!ok[filtro]) return false;
      if (tipo !== "todos" && c.tipo !== tipo) return false;
      if (modulo !== "todos") {
        const s = assinaturaDoModulo(c, modulo);
        if (!s || s.status === "canceled" || s.status === "expired") return false;
      }
      if (!t) return true;
      const textos = [c.nome, c.email_cobranca, c.titular?.nome, ...c.empresas.flatMap((e) => [e.nome, e.fantasia])]
        .filter(Boolean).map((x) => x!.toLowerCase());
      const docs = [c.documento, ...c.empresas.map((e) => e.cnpj)].map((x) => (x ?? "").replace(/\D/g, ""));
      return textos.some((x) => x.includes(t)) || (td.length >= 3 && docs.some((d) => d.includes(td)));
    });
  }, [contas, busca, filtro, modulo, tipo]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Clientes" description="Contas de cobrança de produção (modelo V2)" />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          ["Total de clientes", resumo.clientes],
          ["MRR potencial", brl(resumo.mrr)],
          ["Sem assinatura", resumo.semAssinatura],
          ["Internas", resumo.internas],
          ["Encerradas/sem empresa", resumo.encerradas],
        ].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{isLoading ? "…" : v}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, CNPJ ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{FILTROS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={modulo} onValueChange={setModulo}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os módulos</SelectItem>
            {MODULOS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Empresa e Grupo</SelectItem>
            <SelectItem value="empresa">Empresa</SelectItem>
            <SelectItem value="grupo">Grupo</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground md:ml-auto">{lista.length} conta(s)</span>
      </div>

      {error && <p className="text-sm text-destructive">Não foi possível carregar as contas. Recarregue a página; se persistir, verifique se você é super admin.</p>}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conta</TableHead>
              <TableHead>Empresas</TableHead>
              <TableHead>Titular / Admins</TableHead>
              {MODULOS.map((m) => <TableHead key={m.key}>{m.label}</TableHead>)}
              <TableHead>MRR potencial</TableHead>
              <TableHead>Próxima fatura</TableHead>
              <TableHead>Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
            )) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma conta neste filtro.</TableCell></TableRow>
            ) : lista.map((c) => {
              const v2 = semAcessoV2(c);
              return (
                <TableRow key={c.id} className={`cursor-pointer ${v2 ? "bg-destructive/5" : ""}`} onClick={() => setAberta(c.id)}>
                  <TableCell className="min-w-[200px]">
                    <div className="font-medium">{c.nome}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{c.tipo === "grupo" ? "Grupo" : "Empresa"}</Badge>
                      {c.is_internal && <Badge variant="secondary">Interna</Badge>}
                      {semAssinatura(c) && <Badge variant="outline">Sem assinatura</Badge>}
                      {v2 && <Badge variant="destructive">Sem acesso no modelo V2</Badge>}
                      {c.inadimplente && <Badge variant="destructive">Inadimplente</Badge>}
                    </div>
                    {c.email_cobranca && <div className="text-xs text-muted-foreground">{c.email_cobranca}</div>}
                  </TableCell>
                  <TableCell className="min-w-[200px] text-xs">
                    {c.empresas.length === 0 ? <span className="text-muted-foreground">Nenhuma</span> :
                      c.empresas.map((e) => (
                        <div key={e.id}>{e.nome} <span className="text-muted-foreground">({idCurto(e.cnpj, e.id)})</span></div>
                      ))}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{c.titular?.nome ?? "—"}</div>
                    {c.admins.length > 0 && <div className="text-muted-foreground">+{c.admins.length} admin(s)</div>}
                  </TableCell>
                  {MODULOS.map((m) => <TableCell key={m.key}><ModuloCelula c={c} mod={m.key} /></TableCell>)}
                  <TableCell className="text-sm">{c.is_internal ? <span className="text-muted-foreground">Fora (interna)</span> : brl(mrrPotencial(c))}</TableCell>
                  <TableCell className="text-xs">
                    {c.proxima_fatura ? <>{dataBR(c.proxima_fatura.due_date)}<br />{brl(c.proxima_fatura.amount_cents)}</> : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{dataBR(c.created_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Cliente360Drawer conta={contas.find((c) => c.id === aberta) ?? null} onClose={() => setAberta(null)} />
    </div>
  );
}
