import { ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { tituloSistema } from "@/lib/text/titleCase";
import type { RegimeRiscoTipo } from "@/lib/dp/regime-riscos";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: RegimeRiscoTipo;
  /** Aplica o vínculo sugerido no formulário. */
  onEscolher?: (regime: "clt" | "intermitente") => void;
}

const Bloco = ({ titulo, itens }: { titulo: string; itens: string[] }) => (
  <section className="space-y-1.5">
    <h4 className="text-sm font-semibold">{tituloSistema(titulo)}</h4>
    <ul className="space-y-1 text-sm text-muted-foreground">
      {itens.map((t) => (
        <li key={t} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  </section>
);

/** Explicação em linguagem de dono de loja sobre o vínculo e as alternativas seguras. */
export function RegimeRiscoDialog({ open, onOpenChange, tipo, onEscolher }: Props) {
  const intermitente = (
    <div className="space-y-4">
      <Bloco
        titulo="Como Funciona o Contrato Intermitente"
        itens={[
          "Você assina o contrato uma vez, sem jornada fixa: o colaborador fica na equipe e só trabalha quando é chamado.",
          "Cada chamada é uma convocação feita com 3 dias de antecedência, informando o dia, o horário e o valor.",
          "O colaborador tem 1 dia útil para aceitar ou recusar, e recusar não gera punição.",
          "Ao fim de cada convocação você paga o proporcional: salário das horas, férias + 1/3, 13º, descanso semanal e FGTS.",
          "Entre as convocações não há salário a pagar nem exclusividade — ele pode trabalhar em outro lugar.",
          "O valor da hora não pode ser menor que o do mensalista da mesma função nem menor que o salário mínimo por hora.",
        ]}
      />
      <Bloco
        titulo="O que Muda no Sistema"
        itens={[
          "As chamadas passam a ser registradas em Convocações, com aceite do colaborador pelo portal.",
          "A convocação aceita entra automaticamente na escala do mês e no controle de ponto.",
          "As horas convocadas viram lançamentos na folha, com os encargos calculados.",
        ]}
      />
    </div>
  );

  const pj = (
    <div className="space-y-4">
      <Bloco
        titulo="O que Caracteriza Vínculo de Emprego"
        itens={[
          "Pessoalidade: só aquela pessoa pode fazer o serviço, não pode mandar outra no lugar.",
          "Subordinação: você define horário, ordem das tarefas e cobra resultado no dia a dia.",
          "Habitualidade: o trabalho se repete com frequência, não é eventual.",
          "Onerosidade: existe pagamento contínuo pelo trabalho prestado.",
        ]}
      />
      <Bloco
        titulo="Quando PJ ou MEI é Adequado"
        itens={[
          "Serviço pontual ou por projeto, com prazo e escopo definidos.",
          "O prestador decide como, quando e onde executa o serviço.",
          "Ele atende outros clientes e tem estrutura própria.",
        ]}
      />
      <Bloco
        titulo="O que Costuma Derrubar a Tese de Autonomia"
        itens={[
          "Escala fixa, controle de ponto e cobrança de horário.",
          "Uniforme, crachá e subordinação a um gestor da loja.",
          "Você como único cliente e pagamento mensal fixo, igual a salário.",
        ]}
      />
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Se o vínculo for reconhecido, o custo vem de uma vez: registro retroativo, férias + 1/3, 13º,
            FGTS + multa de 40%, INSS patronal, horas extras do período e honorários — normalmente muito
            acima do que se economizou com a nota fiscal.
          </span>
        </p>
      </div>
      <section className="space-y-1.5">
        <h4 className="text-sm font-semibold">{tituloSistema("Comparativo para a Mesma Função")}</h4>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Ponto</th>
                <th className="p-2 font-medium">CLT</th>
                <th className="p-2 font-medium">Intermitente</th>
                <th className="p-2 font-medium">PJ/MEI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2 font-medium">Horário e escala</td>
                <td className="p-2">Você define</td>
                <td className="p-2">Definido na convocação</td>
                <td className="p-2">Não pode impor</td>
              </tr>
              <tr>
                <td className="p-2 font-medium">Custo</td>
                <td className="p-2">Salário + encargos todo mês</td>
                <td className="p-2">Só o que for convocado</td>
                <td className="p-2">Nota fiscal do serviço</td>
              </tr>
              <tr>
                <td className="p-2 font-medium">Risco trabalhista</td>
                <td className="p-2">Baixo</td>
                <td className="p-2">Baixo</td>
                <td className="p-2">Alto se houver subordinação</td>
              </tr>
              <tr>
                <td className="p-2 font-medium">Indicado para</td>
                <td className="p-2">Equipe fixa da operação</td>
                <td className="p-2">Picos, fins de semana, eventos</td>
                <td className="p-2">Serviço técnico eventual</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {intermitente}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            {tipo === "freelancer"
              ? tituloSistema("Contrato Intermitente: o Caminho Legal")
              : tituloSistema("PJ e MEI: Riscos e Alternativas")}
          </DialogTitle>
          <DialogDescription>
            Orientação para você decidir com segurança. O cadastro não é bloqueado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {tipo === "freelancer" ? intermitente : pj}
        </div>

        <DialogFooter className="flex-col gap-2 border-t p-4 sm:flex-row">
          <Button variant="outline" className="sm:flex-none" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onEscolher && (
            <Button
              className="gap-2 sm:flex-none"
              onClick={() => { onEscolher("intermitente"); onOpenChange(false); }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Mudar para Intermitente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
