import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import type { Tables, Database } from "@/integrations/supabase/types";
import { formatBRL } from "@/lib/billing";
import { format } from "date-fns";

interface PaymentTransaction {
 id: string; description: string; amount: number; amount_paid: number;
 transaction_type: "entrada" | "saida"; account_id: string;
 category_id: string | null; contact_id: string | null;
}
interface Props { open: boolean; onOpenChange: (open: boolean) => void; bill: PaymentTransaction | null; onPaid: () => void }
type PaymentArgs = Database["public"]["Functions"]["record_transaction_payment"]["Args"];
type ReverseArgs = Database["public"]["Functions"]["reverse_transaction_payment"]["Args"];
const today = () => format(new Date(), "yyyy-MM-dd");

export function PaymentDialog({ open, onOpenChange, bill, onPaid }: Props) {
 const { user } = useAuth();
 const { contextType, selectedCompanyId } = useCompanyContext();
 const [paymentAmount, setPaymentAmount] = useState("");
 const [paymentDate, setPaymentDate] = useState(today);
 const [accountId, setAccountId] = useState("");
 const [paymentMethodId, setPaymentMethodId] = useState("");
 const [methods, setMethods] = useState<Tables<"payment_methods">[]>([]);
 const [accounts, setAccounts] = useState<{id: string; name: string}[]>([]);
 const [history, setHistory] = useState<Tables<"transaction_payments">[]>([]);
 const [current, setCurrent] = useState<{amount: number; amount_paid: number; status: string; payment_ledger_enabled: boolean} | null>(null);
 const [reversalId, setReversalId] = useState("");
 const [reason, setReason] = useState("");
 const [reversalDate, setReversalDate] = useState(today);
 const [saving, setSaving] = useState(false);
 const [loading, setLoading] = useState(true);
 const inFlight = useRef(false);
 const slot = user && bill ? "f02-payment:" + user.id + ":" + bill.id : "";

 const reload = useCallback(async () => {
   if (!bill) return;
   const [tx, payments] = await Promise.all([
     supabase.from("transactions").select("amount,amount_paid,status,payment_ledger_enabled").eq("id",bill.id).single(),
     supabase.from("transaction_payments").select("*").eq("transaction_id",bill.id).order("created_at"),
   ]);
   if (tx.error) throw tx.error;
   if (payments.error) throw payments.error;
   setCurrent(tx.data);
   setHistory(payments.data);
 }, [bill?.id]);

 useEffect(() => {
   if (!open || !bill || !user) return;
   let alive = true;
   setCurrent(null); setHistory([]); setLoading(true);
   setPaymentAmount(""); setAccountId(bill.account_id); setPaymentDate(today()); setPaymentMethodId("");
   setReversalId(""); setReason(""); setReversalDate(today());
   // Keep the same request after an uncertain network response, including reopening.
   try {
     const saved = localStorage.getItem(slot);
     if (saved) {
       const args: PaymentArgs = JSON.parse(saved);
       setPaymentAmount(args._amount.toFixed(2).replace(".",","));
       setAccountId(args._account_id); setPaymentDate(args._paid_on); setPaymentMethodId(args._payment_method_id ?? "");
     }
   } catch { toast.error("Não foi possível recuperar a tentativa de pagamento"); }
   let q = supabase.from("accounts").select("id,name").eq("context",contextType).eq("is_active",true).is("soft_deleted_at",null);
   q = contextType === "pj" ? q.eq("company_id",selectedCompanyId ?? "") : q.eq("user_id",user.id).is("company_id",null);
   Promise.all([reload(),q,supabase.rpc("get_accessible_payment_methods",{_context:contextType,_company_id:contextType==="pj" ? selectedCompanyId! : undefined})])
     .then(([,a,m]) => { if(a.error) throw a.error; if(m.error) throw m.error; if(alive){setAccounts(a.data ?? []);setMethods((m.data ?? []) as Tables<"payment_methods">[]);} })
     .catch(e => toast.error("Erro ao carregar pagamentos",{description:e.message}))
     .finally(() => {if(alive)setLoading(false);});
   return () => {alive=false;};
 }, [open,bill?.id,user?.id,contextType,selectedCompanyId,reload,slot]);

 const handlePayment = async (event: React.FormEvent) => {
   event.preventDefault();
   if (!bill || !user || !current || inFlight.current) return;
   const amount = parseCurrencyToNumber(paymentAmount);
   if (amount<=0 || !accountId || !paymentDate) return toast.error("Informe valor, data e conta");
   inFlight.current=true;setSaving(true);
   try {
     const saved=localStorage.getItem(slot);
     const prior: PaymentArgs | null=saved ? JSON.parse(saved) : null;
     const args: PaymentArgs={_transaction_id:bill.id,_amount:amount,_paid_on:paymentDate,_account_id:accountId,
       _idempotency_key:prior?._idempotency_key ?? crypto.randomUUID(),_payment_method_id:paymentMethodId || null};
     if (prior && JSON.stringify(prior)!==JSON.stringify(args)) throw new Error("Há uma tentativa pendente. Reabra o histórico e repita os dados originais para verificar o resultado.");
     // Persist before sending, never mint a new key merely because fetch failed.
     localStorage.setItem(slot,JSON.stringify(args));
     const {error}=await supabase.rpc("record_transaction_payment",args);
     if(error) {if(error.code==="23514")localStorage.removeItem(slot);throw error;}
     localStorage.removeItem(slot);
     setPaymentAmount("");setPaymentMethodId("");
     toast.success("Pagamento registrado");
     await reload();onPaid();
   } catch(e) {toast.error("Erro ao registrar pagamento",{description:(e as Error).message});}
   finally {inFlight.current=false;setSaving(false);}
 };
 const handleReverse = async () => {
   if(!bill || !reversalId || reason.trim().length<3 || inFlight.current) return;
   inFlight.current=true;setSaving(true);
   try {
     const key=slot+":reverse:"+reversalId;
     const saved=localStorage.getItem(key);
     const prior: ReverseArgs | null=saved ? JSON.parse(saved) : null;
     const args: ReverseArgs={_transaction_id:bill.id,_payment_id:reversalId,_paid_on:reversalDate,
       _idempotency_key:prior?._idempotency_key ?? crypto.randomUUID(),_reason:reason.trim()};
     if (prior && JSON.stringify(prior)!==JSON.stringify(args)) throw new Error("Repita os dados originais do estorno pendente.");
     localStorage.setItem(key,JSON.stringify(args));
     const {error}=await supabase.rpc("reverse_transaction_payment",args);
     if(error) {if(error.code==="23514")localStorage.removeItem(key);throw error;}
     localStorage.removeItem(key);setReversalId("");setReason("");
     toast.success("Pagamento estornado");await reload();onPaid();
   } catch(e){toast.error("Erro ao estornar",{description:(e as Error).message});}
   finally{inFlight.current=false;setSaving(false);}
 };
 const cancelTitle=async()=>{
   if(!bill || inFlight.current)return;
   inFlight.current=true;setSaving(true);
   try{
     const {error}=await supabase.from("transactions").update({status:"cancelado"}).eq("id",bill.id).select("id").single();
     if(error)throw error;
     toast.success("Título cancelado");await reload();onPaid();
   }catch(e){toast.error("Erro ao cancelar",{description:(e as Error).message});}
   finally{inFlight.current=false;setSaving(false);}
 };
 if (!bill) return null;
 const remaining=current ? Math.max(0,current.amount-current.amount_paid) : 0;
 const reversed=new Set(history.map(p=>p.reversal_of));
 const canPay=!!current?.payment_ledger_enabled && current.status!=="cancelado" && remaining>0;
 return (
   <Dialog open={open} onOpenChange={v=>{if(!saving)onOpenChange(v);}}>
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
     <DialogHeader><DialogTitle>Pagamentos e estornos</DialogTitle><DialogDescription>{bill.description}</DialogDescription></DialogHeader>
     {loading ? <p>Carregando pagamentos…</p> : current && <>
      <p className="text-sm">Total: {formatBRL(current.amount)} · Pago: {formatBRL(current.amount_paid)} · Restante: {formatBRL(remaining)}</p>
      {!current.payment_ledger_enabled && <p className="text-sm">Este lançamento usa o fluxo legado ou de fatura. Seu histórico não foi convertido automaticamente.</p>}
      {canPay && <form onSubmit={handlePayment} className="space-y-3">
       <div><Label htmlFor="payment-amount">Valor do pagamento</Label><CurrencyInput id="payment-amount" value={paymentAmount} onValueChange={setPaymentAmount} disabled={saving}/></div>
       <div><Label htmlFor="payment-date">Data do pagamento</Label><Input id="payment-date" type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required disabled={saving}/></div>
       <div><Label>Conta do pagamento</Label><Select value={accountId} onValueChange={setAccountId} disabled={saving}><SelectTrigger><SelectValue placeholder="Selecione a conta"/></SelectTrigger><SelectContent>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
       <div><Label>Forma de pagamento</Label><Select value={paymentMethodId || "__none"} onValueChange={v=>setPaymentMethodId(v==="__none"?"":v)} disabled={saving}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none">Não informada</SelectItem>{methods.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
       <div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={()=>setPaymentAmount(remaining.toFixed(2).replace(".",","))}>Preencher restante</Button><Button type="submit" disabled={saving}>Registrar pagamento</Button></div>
      </form>}
      {history.length>0 && <div className="space-y-2"><h3 className="font-semibold">Histórico</h3>{history.map(p=><div key={p.id} className="border rounded p-2 text-sm">
       <p>{p.reversal_of ? "Estorno" : "Pagamento"} · {formatBRL(p.amount)} · {p.paid_on.split("-").reverse().join("/")}</p>
       <p className="text-muted-foreground">{accounts.find(a=>a.id===p.account_id)?.name ?? "Conta do registro"}{p.reason ? " · "+p.reason : ""}</p>
       {!p.reversal_of && !reversed.has(p.id) && <Button type="button" size="sm" variant="outline" disabled={saving} onClick={()=>{
         setReversalId(p.id);setReason("");setReversalDate(today());
         const saved=localStorage.getItem(slot+":reverse:"+p.id);
         if(saved){const args: ReverseArgs=JSON.parse(saved);setReason(args._reason);setReversalDate(args._paid_on);}
       }}>Estornar este pagamento</Button>}
       {reversed.has(p.id) && <span>Estornado</span>}
      </div>)}</div>}
      {reversalId && <div className="space-y-2 border rounded p-3"><Label htmlFor="reverse-reason">Motivo do estorno</Label><Input id="reverse-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={saving}/><Label htmlFor="reverse-date">Data do estorno</Label><Input id="reverse-date" type="date" value={reversalDate} onChange={e=>setReversalDate(e.target.value)} disabled={saving}/><Button type="button" disabled={saving || reason.trim().length<3 || !reversalDate} onClick={handleReverse}>Confirmar estorno</Button></div>}
      {current.payment_ledger_enabled && current.amount_paid===0 && current.status!=="cancelado" && <Button type="button" variant="outline" disabled={saving} onClick={cancelTitle}>Cancelar título sem valor pago</Button>}
     </>}
    </DialogContent>
   </Dialog>
 );
}
