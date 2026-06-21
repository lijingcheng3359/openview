import { Component, onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import "./CodeViewer.css";

const extToLangName: Record<string, string> = {
  py: "Python",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  go: "Go",
  rs: "Rust",
  java: "Java",
  c: "C",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  h: "C",
  hpp: "C++",
  hxx: "C++",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  htm: "HTML",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  sql: "SQL",
  swift: "Swift",
  kt: "Kotlin",
  kts: "Kotlin",
  scala: "Scala",
  lua: "Lua",
  r: "R",
  pl: "Perl",
  pm: "Perl",
  ex: "Erlang",
  exs: "Erlang",
  erl: "Erlang",
  hs: "Haskell",
  ml: "OCaml",
  clj: "Clojure",
  dart: "Dart",
  vue: "Vue",
  svelte: "Svelte",
  zig: "Zig",
  d: "D",
  m: "Objective-C",
  mm: "Objective-C++",
  gradle: "Groovy",
  cmake: "CMake",
  dockerfile: "Dockerfile",
  tf: "HCL",
  hcl: "HCL",
  proto: "Protobuf",
  graphql: "GraphQL",
  gql: "GraphQL",
  wasm: "WebAssembly",
  wat: "WebAssembly",
};

const filenameToLangName: Record<string, string> = {
  makefile: "CMake",
  dockerfile: "Dockerfile",
  "cmakelists.txt": "CMake",
  gemfile: "Ruby",
  rakefile: "Ruby",
};

function getLangExtension(filename: string) {
  const base = filename.toLowerCase();
  const langName = filenameToLangName[base] || extToLangName[filename.split(".").pop()?.toLowerCase() || ""];
  if (!langName) return null;
  const desc = LanguageDescription.matchLanguageName(languages, langName);
  return desc ?? null;
}

const CodeViewer: Component<{ content: string; filename: string }> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  onMount(async () => {
    const langExtensions: any[] = [];
    const langDesc = getLangExtension(props.filename);
    if (langDesc) {
      const support = await langDesc.load();
      langExtensions.push(support);
    }

    const state = EditorState.create({
      doc: props.content,
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        ...langExtensions,
        EditorView.theme({
          "&": { height: "100%", background: "var(--bg-editor, #1e1e1e)" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: '"SF Mono", Menlo, monospace', fontSize: "13px" },
          ".cm-gutters": { background: "var(--bg-sidebar, #252526)", border: "none" },
          ".cm-cursor": { display: "none" },
        }),
      ],
    });

    view = new EditorView({ state, parent: containerRef! });
  });

  createEffect(() => {
    const newContent = props.content;
    if (!view) return;
    const current = view.state.doc.toString();
    if (newContent !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: newContent } });
    }
  });

  onCleanup(() => view?.destroy());

  return <div class="code-viewer" ref={containerRef} />;
};

export default CodeViewer;
