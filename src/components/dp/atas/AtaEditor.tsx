import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UIcon, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, Minus, Pilcrow,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Barra({ editor, extra }: { editor: Editor; extra?: React.ReactNode }) {
  const B = ({ on, ativo, icon: I, label }: { on: () => void; ativo?: boolean; icon: any; label: string }) => (
    <Toggle size="sm" pressed={!!ativo} onPressedChange={on} aria-label={label} title={label} className="h-8 w-8 p-0">
      <I className="h-4 w-4" />
    </Toggle>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-muted/60 p-1">
      <B label="Desfazer" icon={Undo2} on={() => c().undo().run()} />
      <B label="Refazer" icon={Redo2} on={() => c().redo().run()} />
      <span className="mx-1 h-5 w-px bg-border" />
      <B label="Texto normal" icon={Pilcrow} ativo={editor.isActive("paragraph")} on={() => c().setParagraph().run()} />
      <B label="Título 1" icon={Heading1} ativo={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()} />
      <B label="Título 2" icon={Heading2} ativo={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()} />
      <B label="Título 3" icon={Heading3} ativo={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()} />
      <span className="mx-1 h-5 w-px bg-border" />
      <B label="Negrito" icon={Bold} ativo={editor.isActive("bold")} on={() => c().toggleBold().run()} />
      <B label="Itálico" icon={Italic} ativo={editor.isActive("italic")} on={() => c().toggleItalic().run()} />
      <B label="Sublinhado" icon={UIcon} ativo={editor.isActive("underline")} on={() => c().toggleUnderline().run()} />
      <B label="Tachado" icon={Strikethrough} ativo={editor.isActive("strike")} on={() => c().toggleStrike().run()} />
      <span className="mx-1 h-5 w-px bg-border" />
      <B label="Lista com marcadores" icon={List} ativo={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()} />
      <B label="Lista numerada" icon={ListOrdered} ativo={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()} />
      <B label="Citação" icon={Quote} ativo={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()} />
      <B label="Linha divisória" icon={Minus} on={() => c().setHorizontalRule().run()} />
      <span className="mx-1 h-5 w-px bg-border" />
      <B label="Alinhar à esquerda" icon={AlignLeft} ativo={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()} />
      <B label="Centralizar" icon={AlignCenter} ativo={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()} />
      <B label="Alinhar à direita" icon={AlignRight} ativo={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()} />
      <B label="Justificar" icon={AlignJustify} ativo={editor.isActive({ textAlign: "justify" })} on={() => c().setTextAlign("justify").run()} />
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
}

/** Editor de texto estilo Word para o conteúdo da ata. */
export function AtaEditor({ value, onChange, disabled, extra }: {
  value: string; onChange: (html: string) => void; disabled?: boolean; extra?: React.ReactNode;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Escreva aqui a pauta, as discussões e os combinados da reunião…" }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false);
  }, [value, editor]);
  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);
  if (!editor) return null;
  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", disabled && "opacity-80")}>
      {!disabled && <Barra editor={editor} extra={extra} />}
      <EditorContent
        editor={editor}
        className="ata-editor max-h-[60vh] min-h-[280px] overflow-y-auto px-4 py-3 text-sm [&_.ProseMirror]:min-h-[250px] [&_.ProseMirror]:outline-none [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_hr]:my-3 [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

export { Button as _B };
