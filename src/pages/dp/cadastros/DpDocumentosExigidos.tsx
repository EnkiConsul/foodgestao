import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FileCheck2, Plus, RotateCcw, Trash2, Info, Loader2 } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDpDocumentoRequisitos } from "@/hooks/useDpDocumentoRequisitos";
import {
  APLICA_LABEL, CATEGORIA_LABEL, PERIODICIDADE_LABEL, type DpDocumentoRequisito,
} from "@/lib/dp/documentos-requisitos";

const OBRIGATORIEDADES = [
  { value: "obrigatorio", label: "Obrigatório" },
  { value: "opcional", label: "Opcional" },
  { value: "desativado", label: "Não exigir" },
];

export default function DpDocumentosExigidos() {
  const { requisitos, isLoading, semear, salvar, criar, remover } = useDpDocumentoRequisitos();
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({
    nome: "",
    categoria: "admissao",
    aplica_a: "todos",
    obrigatoriedade: "obrigatorio",
    periodicidade: "unica",
    meses_validade: "",
    dias_aviso: "30",
  });

  const grupos = useMemo(() => {
    const map = new Map<string, DpDocumentoRequisito[]>();
    for (const r of requisitos) {
      if (!map.has(r.categoria)) map.set(r.categoria, []);
      map.get(r.categoria)!.push(r);
    }
    return [...map.entries()];
  }, [requisitos]);

  const obrigatorios = requisitos.filter((r) => r.obrigatoriedade === "obrigatorio").length;

  return (
    <DpPage>
      <Helmet>
        <title>Documentos exigidos | Pessoas 360°</title>
        <meta
          name="description"
          content="Defina quais documentos são obrigatórios na admissão, por cargo, veículo, regime e dependentes."
        />
      </Helmet>

      <DpPageHeader
        title="Documentos exigidos"
        description="Lista de documentos que a empresa cobra dos colaboradores. Vem preenchida com o padrão do sistema e pode ser ajustada."
        icon={FileCheck2}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={semear.isPending} onClick={() => semear.mutate()}>
              {semear.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RotateCcw className="mr-1 size-4" />}
              Restaurar padrão
            </Button>
            <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 size-4" /> Novo documento</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo documento exigido</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Nome</Label>
                    <Input
                      value={novo.nome}
                      maxLength={120}
                      onChange={(e) => setNovo((s) => ({ ...s, nome: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Categoria</Label>
                      <Select value={novo.categoria} onValueChange={(v) => setNovo((s) => ({ ...s, categoria: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Quem deve entregar</Label>
                      <Select value={novo.aplica_a} onValueChange={(v) => setNovo((s) => ({ ...s, aplica_a: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(APLICA_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Exigência</Label>
                      <Select
                        value={novo.obrigatoriedade}
                        onValueChange={(v) => setNovo((s) => ({ ...s, obrigatoriedade: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OBRIGATORIEDADES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Renovação</Label>
                      <Select
                        value={novo.periodicidade}
                        onValueChange={(v) => setNovo((s) => ({ ...s, periodicidade: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PERIODICIDADE_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setNovoAberto(false)}>Cancelar</Button>
                  <Button
                    disabled={!novo.nome.trim() || criar.isPending}
                    onClick={async () => {
                      await criar.mutateAsync({
                        nome: novo.nome.trim(),
                        categoria: novo.categoria,
                        aplica_a: novo.aplica_a,
                        obrigatoriedade: novo.obrigatoriedade,
                        periodicidade: novo.periodicidade,
                        meses_validade: novo.meses_validade ? Number(novo.meses_validade) : null,
                        dias_aviso: Number(novo.dias_aviso) || 30,
                      });
                      setNovoAberto(false);
                      setNovo((s) => ({ ...s, nome: "" }));
                    }}
                  >
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          A falta de documento não bloqueia o cadastro do colaborador: ela aparece como pendência para o
          gestor e no acesso do próprio colaborador, que pode anexar o arquivo para aprovação.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{requisitos.length} documentos na lista</Badge>
        <Badge variant="outline">{obrigatorios} obrigatórios</Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        grupos.map(([categoria, itens]) => (
          <DpContentCard key={categoria} title={CATEGORIA_LABEL[categoria] ?? categoria}>
            <div className="space-y-2">
              {itens.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.nome}</span>
                      {r.sistema && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
                      {r.gerado_pelo_sistema && (
                        <Badge variant="outline" className="text-xs">Gerado pelo sistema</Badge>
                      )}
                      {r.satisfeito_por === "aso" && (
                        <Badge variant="outline" className="text-xs">Vem do módulo de exames</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {APLICA_LABEL[r.aplica_a] ?? r.aplica_a} · Renovação:{" "}
                      {PERIODICIDADE_LABEL[r.periodicidade] ?? r.periodicidade}
                      {r.descricao ? ` · ${r.descricao}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(r.periodicidade === "anual" || r.periodicidade === "semestral") && (
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-[110px]"
                        aria-label="Meses de validade"
                        defaultValue={r.meses_validade ?? ""}
                        onBlur={(e) =>
                          salvar.mutate({
                            id: r.id,
                            patch: { meses_validade: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      />
                    )}
                    <Select
                      value={r.obrigatoriedade}
                      onValueChange={(v) => salvar.mutate({ id: r.id, patch: { obrigatoriedade: v } })}
                    >
                      <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OBRIGATORIEDADES.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!r.sistema && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover documento"
                        onClick={() => remover.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </DpContentCard>
        ))
      )}
    </DpPage>
  );
}
