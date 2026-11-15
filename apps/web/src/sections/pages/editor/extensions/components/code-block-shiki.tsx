import { blockBackgroundProps } from "../lib/block-background";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
} from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, Code, PanelTop, Rows3 } from "@/components/icons";
import CodeBlockShikiBase from "tiptap-extension-code-block-shiki";
import { createMermaidHighlightingPlugin } from "../lib/mermaid-highlighting";

import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ui/code-block/code-block";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";

const MermaidPreview = lazy(() => import("./mermaid-preview"));
const mermaidViews = [
  { value: "code", label: "Code", icon: Code },
  { value: "split", label: "Split view", icon: Rows3 },
  { value: "preview", label: "Preview", icon: PanelTop },
] as const;
type MermaidView = (typeof mermaidViews)[number]["value"];

const codeBlockLanguages = [
  { label: "Auto detect", value: "auto" },
  { label: "ABAP", value: "abap" },
  { label: "ActionScript", value: "actionscript-3" },
  { label: "Ada", value: "ada" },
  { label: "Angular HTML", value: "angular-html" },
  { label: "Angular TypeScript", value: "angular-ts" },
  { label: "Apache", value: "apache" },
  { label: "AppleScript", value: "applescript" },
  { label: "AsciiDoc", value: "asciidoc" },
  { label: "Assembly", value: "asm" },
  { label: "Astro", value: "astro" },
  { label: "AWK", value: "awk" },
  { label: "Bash", value: "bash" },
  { label: "Batch", value: "bat" },
  { label: "Beancount", value: "beancount" },
  { label: "BibTeX", value: "bibtex" },
  { label: "Bicep", value: "bicep" },
  { label: "C", value: "c" },
  { label: "C#", value: "csharp" },
  { label: "C++", value: "cpp" },
  { label: "Cairo", value: "cairo" },
  { label: "Clojure", value: "clojure" },
  { label: "CMake", value: "cmake" },
  { label: "COBOL", value: "cobol" },
  { label: "CoffeeScript", value: "coffee" },
  { label: "CSS", value: "css" },
  { label: "CSV", value: "csv" },
  { label: "D", value: "d" },
  { label: "Dart", value: "dart" },
  { label: "Diff", value: "diff" },
  { label: "Dockerfile", value: "docker" },
  { label: "Elixir", value: "elixir" },
  { label: "Elm", value: "elm" },
  { label: "Erlang", value: "erlang" },
  { label: "F#", value: "fsharp" },
  { label: "Fortran", value: "fortran-free-form" },
  { label: "GDScript", value: "gdscript" },
  { label: "Git Commit", value: "git-commit" },
  { label: "Git Rebase", value: "git-rebase" },
  { label: "Gleam", value: "gleam" },
  { label: "GLSL", value: "glsl" },
  { label: "Go", value: "go" },
  { label: "GraphQL", value: "graphql" },
  { label: "Groovy", value: "groovy" },
  { label: "Hack", value: "hack" },
  { label: "Haml", value: "haml" },
  { label: "Handlebars", value: "handlebars" },
  { label: "Haskell", value: "haskell" },
  { label: "HCL", value: "hcl" },
  { label: "HTML", value: "html" },
  { label: "HTTP", value: "http" },
  { label: "Ini", value: "ini" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "js" },
  { label: "JSX", value: "jsx" },
  { label: "JSON", value: "json" },
  { label: "JSON with comments", value: "jsonc" },
  { label: "JSON5", value: "json5" },
  { label: "Julia", value: "julia" },
  { label: "Kotlin", value: "kotlin" },
  { label: "LaTeX", value: "latex" },
  { label: "Less", value: "less" },
  { label: "Liquid", value: "liquid" },
  { label: "Lua", value: "lua" },
  { label: "Makefile", value: "make" },
  { label: "Markdown", value: "md" },
  { label: "MATLAB", value: "matlab" },
  { label: "MDX", value: "mdx" },
  { label: "Mermaid", value: "mermaid" },
  { label: "Nginx", value: "nginx" },
  { label: "Nim", value: "nim" },
  { label: "Nix", value: "nix" },
  { label: "Objective-C", value: "objective-c" },
  { label: "OCaml", value: "ocaml" },
  { label: "Perl", value: "perl" },
  { label: "PHP", value: "php" },
  { label: "PL/SQL", value: "plsql" },
  { label: "Plain text", value: "plaintext" },
  { label: "PostCSS", value: "postcss" },
  { label: "PowerShell", value: "powershell" },
  { label: "Prisma", value: "prisma" },
  { label: "Prolog", value: "prolog" },
  { label: "Protocol Buffers", value: "proto" },
  { label: "Pug", value: "pug" },
  { label: "Python", value: "py" },
  { label: "R", value: "r" },
  { label: "Racket", value: "racket" },
  { label: "Raku", value: "raku" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rs" },
  { label: "Sass", value: "sass" },
  { label: "Scala", value: "scala" },
  { label: "Scheme", value: "scheme" },
  { label: "SCSS", value: "scss" },
  { label: "Shell Session", value: "shellsession" },
  { label: "Solidity", value: "solidity" },
  { label: "SQL", value: "sql" },
  { label: "Svelte", value: "svelte" },
  { label: "Swift", value: "swift" },
  { label: "Tcl", value: "tcl" },
  { label: "Terraform", value: "terraform" },
  { label: "TeX", value: "tex" },
  { label: "TOML", value: "toml" },
  { label: "TSX", value: "tsx" },
  { label: "Twig", value: "twig" },
  { label: "TypeScript", value: "ts" },
  { label: "V", value: "v" },
  { label: "Vala", value: "vala" },
  { label: "VB", value: "vb" },
  { label: "Verilog", value: "verilog" },
  { label: "VHDL", value: "vhdl" },
  { label: "Vim Script", value: "viml" },
  { label: "Vue", value: "vue" },
  { label: "WebAssembly", value: "wasm" },
  { label: "WGSL", value: "wgsl" },
  { label: "XML", value: "xml" },
  { label: "YAML", value: "yaml" },
  { label: "Zig", value: "zig" },
];

function CodeBlockShikiView({ editor, node, updateAttributes }: ReactNodeViewProps) {
  const isEditable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });
  const [mermaidView, setMermaidView] = useState<MermaidView>(isEditable ? "split" : "preview");
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const language = node.attrs.language ?? "auto";
  const codeLanguage = language === "auto" ? "" : language;
  const isMermaid = language === "mermaid";
  const view = isMermaid ? mermaidView : "code";
  const activeMermaidView = mermaidViews.find((option) => option.value === mermaidView)!;
  const ViewIcon = activeMermaidView.icon;
  const activeLanguage =
    codeBlockLanguages.find((option) => option.value === language) ?? codeBlockLanguages[0];

  return (
    <NodeViewWrapper
      as="div"
      className="code-block-shiki"
      {...blockBackgroundProps(node.attrs.backgroundColor)}
    >
      <CodeBlock code={node.textContent} language={codeLanguage} highlight={false}>
        <CodeBlockHeader
          className="justify-end border-b-0 px-2 py-1"
          contentEditable={false}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ButtonGroup aria-label="Code block controls" variant="segmented">
            <DropDrawer>
              <DropDrawerTrigger asChild>
                <ButtonGroupItem
                  aria-label="Code block language"
                  disabled={!isEditable}
                  role="combobox"
                  type="button"
                >
                  <span className="truncate">{activeLanguage.label}</span>
                  <ChevronDown className="opacity-50" />
                </ButtonGroupItem>
              </DropDrawerTrigger>
              <DropDrawerContent
                align="end"
                side="bottom"
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                {codeBlockLanguages.map((option) => (
                  <DropDrawerItem
                    icon={option.value === language ? <Check /> : undefined}
                    key={option.value}
                    onSelect={() => {
                      if (!editor.isEditable || editor.isDestroyed) return;
                      updateAttributes({
                        language: option.value === "auto" ? null : option.value,
                      });
                    }}
                  >
                    {option.label}
                  </DropDrawerItem>
                ))}
              </DropDrawerContent>
            </DropDrawer>
            {isMermaid && (
              <Popover open={viewPickerOpen} onOpenChange={setViewPickerOpen}>
                <PopoverTrigger asChild>
                  <ButtonGroupItem
                    aria-label="Mermaid view"
                    title={`Mermaid view: ${activeMermaidView.label}`}
                    layout="icon"
                    size="icon"
                  >
                    <ViewIcon />
                  </ButtonGroupItem>
                </PopoverTrigger>
                <PopoverContent
                  aria-label="Mermaid view options"
                  width="auto"
                  padding="none"
                  gap="none"
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <ButtonGroup aria-label="Mermaid view options" variant="plain" className="p-1">
                    {mermaidViews.map(({ value, label, icon: Icon }) => (
                      <ButtonGroupItem
                        key={value}
                        aria-label={label}
                        aria-pressed={mermaidView === value}
                        title={label}
                        size="icon"
                        variant={mermaidView === value ? "selected" : "ghost"}
                        onClick={() => {
                          setMermaidView(value);
                          setViewPickerOpen(false);
                        }}
                      >
                        <Icon />
                      </ButtonGroupItem>
                    ))}
                  </ButtonGroup>
                </PopoverContent>
              </Popover>
            )}
            <CodeBlockCopyButton
              size="icon"
              preserveSource
              copyText={async (value) => {
                await navigator.clipboard.writeText(value);
              }}
              onCopyError={() => toast.error("Could not copy code.")}
              labels={{ copy: "Copy code", copied: "Copied code" }}
            />
          </ButtonGroup>
        </CodeBlockHeader>
        <CodeBlockContent>
          <pre className="editor-code-content" hidden={view === "preview"}>
            <NodeViewContent<"code">
              as="code"
              className={codeLanguage ? `language-${codeLanguage}` : undefined}
              spellCheck={false}
              style={{ whiteSpace: "pre" }}
            />
          </pre>
          {isMermaid && view !== "code" && (
            <div
              contentEditable={false}
              className={view === "split" ? "border-t border-stroke-default" : undefined}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Suspense
                fallback={<p className="p-4 text-xs text-content-secondary">Loading diagram…</p>}
              >
                <MermaidPreview source={node.textContent} />
              </Suspense>
            </div>
          )}
        </CodeBlockContent>
      </CodeBlock>
    </NodeViewWrapper>
  );
}

export const CodeBlockShiki = CodeBlockShikiBase.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []).filter((plugin) => !plugin.props.handlePaste),
      createMermaidHighlightingPlugin(),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockShikiView);
  },
});
