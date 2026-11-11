import { Loader2, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";
import { resumoAbrangencia, valorCatalogo, type SugestaoSindicato } from "@/lib/dp/sindicatos-catalogo";

/** Grupo "Base Aveto 360" dentro de um Select de sindicatos da empresa. */
export function SindicatoCatalogoSelectGroup({
  sugestoes, separador = true,
}: { sugestoes: SugestaoSindicato[]; separador?: boolean }) {
  if (sugestoes.length === 0) return null;
  return (
    <>
      {separador && <SelectSeparator />}
      <SelectGroup>
        <SelectLabel className="text-xs font-normal text-muted-foreground">Base de sindicatos Aveto 360</SelectLabel>
        {sugestoes.map((s) => (
          <SelectItem key={s.item.id} value={valorCatalogo(s.item.id)}>
            {s.item.nome}
            {s.recomendado && s.cidadeRecomendada ? ` · atende ${s.cidadeRecomendada}` : ""}
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  );
}

/** Cartão da sugestão principal: um toque usa o sindicato da base. */
export function SindicatoCatalogoSugestaoCard({
  sugestao, onUsar, carregando, acao = "Usar este sindicato",
}: {
  sugestao: SugestaoSindicato;
  onUsar: () => void;
  carregando?: boolean;
  acao?: string;
}) {
  const { item } = sugestao;
  return (
    <div className="min-w-0 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="break-words font-semibold">{item.nome}</span>
        <Badge variant="secondary" className="shrink-0">
          {sugestao.recomendado ? `Usado em ${sugestao.cidadeRecomendada}` : "Base Aveto 360"}
        </Badge>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex items-start gap-1">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{resumoAbrangencia(item, sugestao.cidadeRecomendada)}</span>
        </div>
        {item.cnpj && <div>CNPJ: {maskCnpj(item.cnpj)}</div>}
        {item.contato_telefone && <div>WhatsApp: {maskPhone(item.contato_telefone)}</div>}
      </div>
      <Button type="button" className="mt-3 min-h-11 w-full sm:w-auto" onClick={onUsar} disabled={carregando}>
        {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {acao}
      </Button>
    </div>
  );
}
