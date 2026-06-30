import { useState } from "react";
import { Check, ChevronsUpDown, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BRAZILIAN_BANKS, getBankBySlug, getBankLogoUrl } from "@/lib/banks";

interface BankSelectProps {
  value?: string | null;
  onChange: (slug: string | null, name?: string) => void;
  placeholder?: string;
}

export function BankSelect({ value, onChange, placeholder = "Selecione o banco..." }: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = getBankBySlug(value);
  const selectedLogo = getBankLogoUrl(value, 32);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {selectedLogo ? (
                  <img src={selectedLogo} alt="" className="h-5 w-5 rounded object-contain" />
                ) : (
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <>
                <Landmark className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{placeholder}</span>
              </>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar banco..." />
          <CommandList>
            <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <Landmark className="mr-2 h-4 w-4 text-muted-foreground" />
                Outro / Não listado
              </CommandItem>
              {BRAZILIAN_BANKS.map((bank) => {
                const logo = getBankLogoUrl(bank.slug, 32);
                return (
                  <CommandItem
                    key={bank.slug}
                    value={`${bank.name} ${bank.slug}`}
                    onSelect={() => {
                      onChange(bank.slug, bank.name);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === bank.slug ? "opacity-100" : "opacity-0")} />
                    {logo ? (
                      <img src={logo} alt="" className="mr-2 h-5 w-5 rounded object-contain" />
                    ) : (
                      <Landmark className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    {bank.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
