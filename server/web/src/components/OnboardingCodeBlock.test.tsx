import { describe, expect, it } from "vitest";
import { tokenizeKotlinLine } from "./OnboardingCodeBlock";

// Porta o tokenizer Kotlin/Gradle real do OnboardingModal (confirmado via design-graph —
// get_component_full("OnboardingModal") mostra `CodeBlock`/`_highlightLine`; a linha vazia é
// tratada aqui como "nenhum token", não um caso especial do tokenizer — quem renderiza decide o
// que fazer com uma linha em branco, ver OnboardingCodeBlock.tsx). Regra pouco óbvia do algoritmo
// real: pontuação/espaço é anexada ao token anterior só quando esse token já é "plain" (o mesmo
// tipo usado pra identificadores comuns) — uma nova palavra NUNCA funde pra trás com uma
// pontuação já acumulada, sempre inicia um token novo.
describe("tokenizeKotlinLine", () => {
  it("returns no tokens for an empty line", () => {
    expect(tokenizeKotlinLine("")).toEqual([]);
  });

  it("merges whitespace-only content into a single plain token", () => {
    expect(tokenizeKotlinLine("   ")).toEqual([{ type: "plain", value: "   " }]);
  });

  it("treats a whole line starting with // as one comment token", () => {
    expect(tokenizeKotlinLine("// build.gradle.kts")).toEqual([{ type: "comment", value: "// build.gradle.kts" }]);
  });

  it("recognizes a Kotlin keyword as its own token, distinct from a following plain word", () => {
    expect(tokenizeKotlinLine("val x")).toEqual([
      { type: "keyword", value: "val" },
      { type: "plain", value: " " },
      { type: "plain", value: "x" },
    ]);
  });

  it("distinguishes a capitalized identifier (type) from a lowercase one (plain)", () => {
    expect(tokenizeKotlinLine("ToToggleClient")).toEqual([{ type: "type", value: "ToToggleClient" }]);
    expect(tokenizeKotlinLine("client")).toEqual([{ type: "plain", value: "client" }]);
  });

  it("tokenizes a double-quoted string, including an escaped quote inside it", () => {
    expect(tokenizeKotlinLine('"my-app"')).toEqual([{ type: "string", value: '"my-app"' }]);
    expect(tokenizeKotlinLine('"a\\"b"')).toEqual([{ type: "string", value: '"a\\"b"' }]);
  });

  it("tokenizes a numeric literal as its own token", () => {
    expect(tokenizeKotlinLine("5")).toEqual([{ type: "number", value: "5" }]);
  });

  it("cuts a trailing // comment short even mid-line, merging everything before it that it can", () => {
    expect(tokenizeKotlinLine("val x = 1 // comment")).toEqual([
      { type: "keyword", value: "val" },
      { type: "plain", value: " " },
      { type: "plain", value: "x = " },
      { type: "number", value: "1" },
      { type: "plain", value: " " },
      { type: "comment", value: "// comment" },
    ]);
  });

  it("merges punctuation into the identifier right before it, but never merges a following identifier backward", () => {
    expect(tokenizeKotlinLine("client.isActive()")).toEqual([
      { type: "plain", value: "client." },
      { type: "plain", value: "isActive()" },
    ]);
  });
});
