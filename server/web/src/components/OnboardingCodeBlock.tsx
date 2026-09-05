// v2.6 §6.9 — realce de sintaxe Kotlin/Gradle pro passo "Integration" do onboarding wizard.
// Porta o tokenizer confirmado via design-graph (get_component_full("OnboardingModal") →
// CodeBlock/_highlightLine), com os nomes de tipo internos ("tc"/"ts"/"tk"/"tt"/"tp"/"tn")
// trocados por rótulos legíveis — o comportamento caractere-a-caractere é idêntico. Linha em
// branco é responsabilidade de quem renderiza (abaixo), não do tokenizer: uma string vazia aqui
// simplesmente não produz nenhum token.
const KOTLIN_KEYWORDS = new Set([
  "val",
  "var",
  "fun",
  "class",
  "object",
  "if",
  "else",
  "return",
  "import",
  "package",
  "true",
  "false",
  "null",
  "data",
  "override",
  "private",
  "public",
  "apply",
  "build",
  "by",
  "implementation",
  "plugins",
  "kotlin",
  "id",
  "dependencies",
  "this",
  "for",
  "while",
  "when",
  "is",
  "in",
]);

export type KotlinTokenType = "comment" | "string" | "keyword" | "type" | "number" | "plain";

export interface KotlinToken {
  type: KotlinTokenType;
  value: string;
}

// Cores derivadas do design system já existente (nenhum valor de cor específico deste
// syntax-highlighter veio confirmado do protótipo via design-graph — só a estrutura de classes/
// tokens ficou disponível) — mantém o resultado coerente com o resto do app em vez de inventar
// uma paleta nova.
const TOKEN_CLASS: Record<KotlinTokenType, string> = {
  comment: "obcode-comment",
  string: "obcode-string",
  keyword: "obcode-keyword",
  type: "obcode-type",
  number: "obcode-number",
  plain: "obcode-plain",
};

export function tokenizeKotlinLine(line: string): KotlinToken[] {
  const tokens: KotlinToken[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }

    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const type: KotlinTokenType = KOTLIN_KEYWORDS.has(word) ? "keyword" : /^[A-Z]/.test(word) ? "type" : "plain";
      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    if (/[0-9]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    const last = tokens[tokens.length - 1];
    if (last && last.type === "plain") {
      last.value += line[i];
    } else {
      tokens.push({ type: "plain", value: line[i] });
    }
    i++;
  }

  return tokens;
}

interface OnboardingCodeBlockProps {
  code: string;
}

export function OnboardingCodeBlock({ code }: OnboardingCodeBlockProps) {
  return (
    <pre className="ob-code">
      <code>
        {code.split("\n").map((line, i) =>
          line.trim() ? (
            <div key={i} className="cl">
              {tokenizeKotlinLine(line).map((tok, ti) =>
                tok.type === "plain" ? tok.value : (
                  <span key={ti} className={TOKEN_CLASS[tok.type]}>
                    {tok.value}
                  </span>
                )
              )}
            </div>
          ) : (
            <div key={i} className="cl">
              {" "}
            </div>
          )
        )}
      </code>
    </pre>
  );
}
