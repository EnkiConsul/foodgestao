import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Formato = "xlsx" | "csv";

const NOMES: Record<string, string> = {
  _meta: "Informações",
  profiles: "Perfil",
  companies: "Empresas",
  company_members: "Membros",
  company_invites: "Convites",
  companies_member_of: "Empresas Vinculadas",
  accounts: "Contas Financeiras",
  categories: "Categorias",
  contacts: "Contatos",
  payment_methods: "Formas de Pagamento",
  cost_centers: "Centros de Custo",
  tags: "Tags",
  budgets: "Orçamentos",
  transactions: "Lançamentos",
  transaction_attachments: "Anexos",
  transaction_tags: "Tags dos Lançamentos",
  subscriptions: "Assinaturas",
  invoices: "Faturas",
  coupon_redemptions: "Cupons",
  legal_acceptances: "Aceites Legais",
  audit_logs: "Auditoria",
};

type Tabela = { nome: string; colunas: string[]; linhas: unknown[][] };

function celula(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number | boolean;
}

function montarTabelas(data: Record<string, unknown>): Tabela[] {
  const out: Tabela[] = [];
  for (const [key, val] of Object.entries(data)) {
    const nome = NOMES[key] ?? key;
    const rows: Record<string, unknown>[] = Array.isArray(val)
      ? (val as Record<string, unknown>[])
      : val && typeof val === "object"
        ? [val as Record<string, unknown>]
        : [];
    const colunas = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {}))));
    out.push({ nome, colunas, linhas: rows.map((r) => colunas.map((c) => celula(r?.[c]))) });
  }
  return out;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCel = (v: unknown) => `"${v === null || v === undefined ? "" : String(v).replace(/"/g, '""')}"`;

export function ExportMyDataCard() {
  const [loading, setLoading] = useState<Formato | null>(null);

  const handleExport = async (formato: Formato) => {
    setLoading(formato);
    try {
      const { data, error } = await supabase.functions.invoke("export-user-data", {});
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tabelas = montarTabelas(data as Record<string, unknown>);
      const base = `aveto360-meus-dados-${new Date().toISOString().slice(0, 10)}`;

      if (formato === "xlsx") {
        const mod: any = await import("exceljs");
        const ExcelJS = mod.default ?? mod;
        const wb = new ExcelJS.Workbook();
        const usados = new Set<string>();
        for (const t of tabelas) {
          let nome = t.nome.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
          let i = 2;
          while (usados.has(nome)) nome = `${nome.slice(0, 28)} ${i++}`;
          usados.add(nome);
          const ws = wb.addWorksheet(nome);
          if (t.colunas.length === 0) {
            ws.addRow(["Nenhum registro"]);
            continue;
          }
          ws.addRow(t.colunas);
          ws.getRow(1).font = { bold: true };
          ws.views = [{ state: "frozen", ySplit: 1 }];
          t.linhas.forEach((l) => ws.addRow(l));
          ws.columns.forEach((col: any, idx: number) => {
            const max = Math.max(t.colunas[idx].length, ...t.linhas.slice(0, 200).map((l) => String(l[idx] ?? "").length));
            col.width = Math.min(Math.max(max + 2, 10), 50);
          });
        }
        const buf = await wb.xlsx.writeBuffer();
        baixar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
      } else {
        const partes = tabelas.map((t) =>
          [
            csvCel(t.nome),
            t.colunas.length ? t.colunas.map(csvCel).join(";") : csvCel("Nenhum registro"),
            ...t.linhas.map((l) => l.map(csvCel).join(";")),
          ].join("\r\n"),
        );
        baixar(new Blob(["\uFEFF" + partes.join("\r\n\r\n")], { type: "text/csv;charset=utf-8;" }), `${base}.csv`);
      }
      toast.success("Download iniciado", { description: `Seus dados foram exportados em ${formato.toUpperCase()}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao exportar";
      toast.error("Erro ao exportar", { description: `${msg}. Tente novamente em instantes.` });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" /> Exportar meus dados
        </CardTitle>
        <CardDescription>
          Direito à portabilidade (LGPD art. 18, V). Baixe uma cópia completa dos seus dados em Excel (uma aba por
          assunto) ou CSV.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => handleExport("xlsx")} disabled={!!loading}>
          {loading === "xlsx" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
          {loading === "xlsx" ? "Gerando arquivo..." : "Baixar em Excel"}
        </Button>
        <Button variant="outline" onClick={() => handleExport("csv")} disabled={!!loading}>
          {loading === "csv" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          {loading === "csv" ? "Gerando arquivo..." : "Baixar em CSV"}
        </Button>
      </CardContent>
    </Card>
  );
}
