import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react"
import type { ReactNodeViewProps } from "@tiptap/react"
import { Check, ChevronsUpDown, Copy } from "lucide-react"
import { useState } from "react"
import CodeBlockShikiBase from "tiptap-extension-code-block-shiki"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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
]

function CodeBlockShikiView({ node, updateAttributes }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false)
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false)
  const language = node.attrs.language ?? "auto"
  const codeLanguage = language === "auto" ? "" : language
  const activeLanguage =
    codeBlockLanguages.find((option) => option.value === language) ??
    codeBlockLanguages[0]

  const copyCode = async () => {
    await navigator.clipboard.writeText(node.textContent)
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 1200)
  }

  return (
    <NodeViewWrapper as="pre" className="code-block-shiki">
      <div
        className="code-block-controls"
        contentEditable={false}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <Button
          aria-label={copied ? "Copied code" : "Copy code"}
          className="code-block-copy-button"
          onClick={() => {
            void copyCode()
          }}
          size="icon-sm"
          title={copied ? "Copied" : "Copy code"}
          type="button"
          variant="outline"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        <Popover
          onOpenChange={setLanguagePickerOpen}
          open={languagePickerOpen}
        >
          <PopoverTrigger asChild>
            <Button
              aria-expanded={languagePickerOpen}
              aria-label="Code block language"
              className=""
              role="combobox"
              size="sm"
              type="button"
              variant="outline"
            >
              <span className="truncate">{activeLanguage.label}</span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="code-block-language-content"
            onMouseDown={(event) => {
              event.stopPropagation()
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
          >
            <Command>
              <CommandInput placeholder="Search languages..." />
              <CommandList>
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup>
                  {codeBlockLanguages.map((option) => (
                    <CommandItem
                      data-checked={option.value === language}
                      key={option.value}
                      onSelect={() => {
                        updateAttributes({
                          language: option.value === "auto" ? null : option.value,
                        })
                        setLanguagePickerOpen(false)
                      }}
                      value={`${option.label} ${option.value}`}
                    >
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <NodeViewContent<"code">
        as="code"
        className={codeLanguage ? `language-${codeLanguage}` : undefined}
        spellCheck={false}
      />
    </NodeViewWrapper>
  )
}

export const CodeBlockShiki = CodeBlockShikiBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockShikiView)
  },
})
