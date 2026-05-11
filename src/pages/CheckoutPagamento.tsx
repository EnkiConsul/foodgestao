import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TreePine, Loader2, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { formatCents } from "@/lib/billing";
import { toast } from "sonner";

export default function CheckoutPagamento() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [paid, setPaid] = useState(false);

  const { data: invoice, refetch } = useQuery({
    queryKey: ["checkout-invoice", invoiceId],
    enabled: !!invoiceId,
    refetchInterval: paid ? false : 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices").select("*").eq("id", invoiceId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (invoice?.status === "paid") {
      setPaid(true);
      toast.success("Pagamento confirmado!");
    }
  }, [invoice?.status]);

  const copy = (text: string, label = "Copiado!") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Gestor <span className="text-primary">Plin</span></span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/")}>Início</Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        {paid ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              <h2 className="text-xl font-bold">Pagamento confirmado!</h2>
              <p className="text-muted-foreground">Sua assinatura está ativa.</p>
              <Button onClick={() => navigate("/")}>Ir para o app</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  Aguardando pagamento — {formatCents(invoice.amount_cents - invoice.discount_cents)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Vencimento: {new Date(invoice.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>

                {invoice.payment_method === "pix" && invoice.pix_qrcode && (
                  <div className="space-y-3">
                    <div className="flex flex-col items-center gap-3">
                      {/* QR code image is base64 returned in pix_qrcode field of the create function; we store copy-paste here.
                          For the QR image, open the invoiceUrl from Asaas. */}
                      {invoice.external_payment_url && (
                        <Button variant="outline" asChild>
                          <a href={invoice.external_payment_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" /> Abrir QR Code no Asaas
                          </a>
                        </Button>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Pix copia e cola</p>
                      <div className="flex gap-2">
                        <code className="text-xs bg-muted p-2 rounded flex-1 break-all">{invoice.pix_qrcode}</code>
                        <Button size="sm" variant="outline" onClick={() => copy(invoice.pix_qrcode!)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {invoice.payment_method === "boleto" && invoice.boleto_url && (
                  <Button asChild>
                    <a href={invoice.boleto_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" /> Visualizar boleto
                    </a>
                  </Button>
                )}

                {invoice.payment_method === "card" && invoice.external_payment_url && (
                  <Button asChild>
                    <a href={invoice.external_payment_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" /> Pagar com cartão
                    </a>
                  </Button>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verificando pagamento automaticamente…
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => refetch()}>Atualizar</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
