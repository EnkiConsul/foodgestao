import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { FichaRevisaoCard } from "@/components/dp/ficha-registro/FichaRevisaoCard";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  useDpFichaImportacoes, useDpFichaItens, useEnviarFichaPdf,
} from "@/hooks/useDpFichaImportacao";

export default function DpFichaRegistroImportar() {
  const { selectedCompanyId } = useCompanyContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);

  const { data: importacoes = [] } = useDpFichaImportacoes();
  const enviar = useEnviarFichaPdf();

  const atual = useMemo(
    () => importacoes.find((i) => i.id === importacaoId) ?? importacoes[0] ?? null,
    [importacoes, importacaoId],
  );
  const processando = atual?.status === "processing";
  const aguardandoFichas = atual?.status === "ready" && (atual?.fichas_identificadas ?? 0) > 0;
  const { data: itens = [] } = useDpFichaItens(atual?.id, processando, aguardandoFichas);

  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { turnos = [] } = useDpTurnos();
  const unidadesDaEmpresa = useMemo(
    () => unidades
      .filter((u) => u.company_id === selectedCompanyId)
      .map((u) => ({ id: u.id, nome: u.nome, cnpj: (u as { cnpj?: string | null }).cnpj ?? null })),
    [unidades, selectedCompanyId],
  );
  const { data: empresaCnpj = null } = useQuery({
    queryKey: ["company_cnpj", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("cnpj").eq("id", selectedCompanyId!).maybeSingle();
      if (error) throw error;
      return (data?.cnpj as string | null) ?? null;
    },
  });


  useEffect(() => {
    if (!importacaoId && importacoes[0]) setImportacaoId(importacoes[0].id);
  }, [importacoes, importacaoId]);

  const pendentes = itens.filter((i) => ["pendente", "revisar", "duplicado"].includes(i.status));
  const prontos = itens.filter((i) => ["criado", "atualizado"].includes(i.status));

  const enviarArquivo = () => {
    if (!file) return;
    enviar.mutate(file, {
      onSuccess: ({ importacaoId: id }) => {
        setImportacaoId(id);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        toast.success("Ficha enviada — estamos lendo os dados");
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <DpPage>
      <DpPageHeader
        icon={FileText}
        title="Importar ficha de registro"
        description="Envie a ficha de registro em PDF e confira os dados antes de gerar o cadastro."
        actions={
          <Button variant="outline" size="sm" className="h-10 rounded-full" asChild>
            <Link to="/dp/colaboradores">
              <ArrowLeft className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Colaboradores</span>
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enviar ficha em PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pode ser a ficha de uma pessoa ou um arquivo com as fichas de toda a equipe — separamos uma a uma.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="h-10"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={enviar.isPending}
            />
            <Button className="h-10" onClick={enviarArquivo} disabled={!file || enviar.isPending}>
              {enviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar e ler
            </Button>
          </div>
        </CardContent>
      </Card>

      {atual && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{atual.arquivo_nome}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {Math.max(itens.length, atual.fichas_identificadas ?? 0)} ficha(s)
                </Badge>
                {prontos.length > 0 && <Badge className="bg-emerald-600 text-white">{prontos.length} no cadastro</Badge>}
              </div>
            </div>

            {processando && (
              <div className="space-y-1">
                <Progress
                  value={atual.total_paginas ? (atual.paginas_processadas / atual.total_paginas) * 100 : 8}
                />
                <p className="text-xs text-muted-foreground">
                  Lendo página {atual.paginas_processadas} de {atual.total_paginas || "…"} — pode deixar a tela aberta.
                </p>
              </div>
            )}

            {atual.status === "failed" && (
              <p className="text-sm text-destructive">
                Não conseguimos ler este arquivo{atual.erro_mensagem ? `: ${atual.erro_mensagem}` : "."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {pendentes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Conferir e cadastrar ({pendentes.length})</h2>
          {pendentes.map((item) => (
            <FichaRevisaoCard
              key={item.id}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              unidadePadraoId={unidadesDaEmpresa[0]?.id ?? null}
            />
          ))}
        </div>
      )}

      {prontos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Já no cadastro ({prontos.length})</h2>
          {prontos.map((item) => (
            <FichaRevisaoCard
              key={item.id}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              unidadePadraoId={null}
            />
          ))}
        </div>
      )}

      {atual && !processando && itens.length === 0 && atual.status !== "failed" && (
        aguardandoFichas ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as fichas lidas…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma ficha foi reconhecida neste arquivo. Confira se o PDF é a ficha de registro de empregado.
          </p>
        )
      )}
    </DpPage>
  );
}
