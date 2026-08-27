# design-graph — pontos de investigação e melhoria

Log de interações reais com o MCP `design-graph` durante a reescrita do frontend do toToggle
(`server/web/`), registrando onde a ferramenta não devolveu informação suficiente de primeira, o
que precisou ser feito pra contornar, e sugestões concretas de melhoria. Escrito a pedido do
usuário depois de um caso reproduzível (o header de `ApplicationDetailScreen` ficou incompleto
porque `get_component_spec`/`get_full_jsx` nunca expuseram o JSX real).

Cada achado abaixo é reproduzível: `set_prototype(name="toToggle")` e repita as chamadas
listadas.

---

## Achado 1 (o mais impactante): componentes com múltiplos `return` só expõem UM branch

**Sintoma**: `get_full_jsx("App")` e `get_component_spec("App")` sempre devolvem só

```jsx
<FirstLoginScreen user={firstLogin} onComplete={completeFirstLogin} onCancel={() => setFirstLogin(null)} />
```

— que é o branch `if (firstLogin) return <FirstLoginScreen .../>` do componente real. O `return`
principal (a shell autenticada inteira: sidebar, topbar, roteamento de view, todo o conteúdo de
página) **nunca** aparece, em nenhuma chamada, apesar de `get_full_jsx` ser documentado como "JSX
bruto, sem sanitização nem corte".

**Por que isso importa**: `App` é exatamente o componente que a maioria das telas reais precisa
reconstruir primeiro (é a casca do app inteiro — sidebar, nav, breadcrumb). Sem acesso a esse JSX,
cada elemento da shell teve que ser inferido por tentativa e erro (comparação visual com
screenshots) até um usuário apontar divergências — aí sim a fonte real foi encontrada, mas por um
caminho que não deveria ser necessário (ver Achado 4).

**Comando pra reproduzir**:
```
set_prototype(name="toToggle")
get_full_jsx(name="App")
```

**Sugestão de melhoria**: quando um componente tem múltiplos `return` (guard clauses / early
returns — padrão comum em React pra estados de loading/erro/gate), `get_full_jsx` deveria (a)
retornar TODOS os branches, rotulados por sua condição, não só o primeiro encontrado; ou (b)
aceitar um parâmetro pra escolher qual branch (`get_full_jsx(name="App", branch=0)`,
`branch=-1` pro último/`return` principal); ou, no mínimo, (c) sinalizar explicitamente
"componente tem N returns, mostrando 1 de N" em vez de devolver silenciosamente um branch parcial
como se fosse o componente inteiro — o formato atual (nenhum aviso) é o que mais engana, porque
parece uma resposta completa.

---

## Achado 2: listas de textos/estilos truncam sem paginação nem flag pra ver tudo

**Sintoma**: `get_component_spec("App")` devolve só 8 textos com `> ... +7 mais` no final — sem
nenhum parâmetro pra pedir os +7 restantes. O mesmo vale pra "Estilos — default" (`+13 mais` /
`+24 mais` dependendo da chamada).

**Achado colateral útil**: `validate_component_implementation` internamente parece comparar
contra a lista COMPLETA de textos do componente (ela reportou textos como `"Each path is a chain
of toggles —"`, `"New toggle"`, `"{stats.total}"` — que pertencem ao header de
`ApplicationDetailScreen`, nunca visível via `get_full_jsx`/`get_component_spec`), mas o RELATÓRIO
dela também trunca (`+5 mais`, `+2 mais`), então não dá pra usar como substituto confiável de "me
dê a lista inteira" — só aumenta a amostra visível, não garante completude.

**Comandos pra reproduzir**:
```
get_component_spec(name="App")               # textos: 8 mostrados, "+7 mais"
validate_component_implementation(name="App", jsx_source="<div></div>")
                                               # textos ausentes: 10 mostrados, "+5 mais"
```

**Sugestão de melhoria**: um parâmetro `full=true` (ou `limit`/`offset`) em `get_component_spec`/
`get_screen_full` pra listar textos e estilos sem corte, ou uma tool dedicada
(`get_component_texts(name, full=true)`) — hoje a única forma de ver a lista completa é fora do
design-graph.

---

## Achado 3: `get_section` não existe pra componentes fora da lista de "telas"

**Sintoma**: `get_section(screen="App", section="sidebar")` devolve `Seção 'sidebar' não
encontrada em 'App'` — porque `App` nunca aparece em `list_screens()` (só telas menores como
`TeamsView`/`UsersView`/`ApprovalsView` aparecem lá; o componente raiz do app inteiro, que é onde
mora a sidebar/topbar, fica de fora dessa lista por completo).

**Sugestão de melhoria**: ou `App` (e componentes-raiz equivalentes noutros protótipos) deveriam
aparecer em `list_screens()` com suas seções internas indexadas (sidebar/topbar/main como
"seções" de verdade), ou a documentação da tool deveria deixar explícito que `get_section` só
funciona pra entradas de `list_screens()` — hoje descobrir isso exige tentativa e erro.

---

## Achado 4: o workaround que efetivamente funcionou (fora do design-graph)

Quando um componente cai nos Achados 1–3 (JSX real inacessível), a fonte de verdade completa
ainda existe — só não passa pelo design-graph. O export do protótipo
(`docs/toToggle v2.1.html`) embute um `<script type="__bundler/manifest">` com um JSON mapeando
UUID → `{mime, compressed, data}`, onde `data` é gzip+base64 do arquivo-fonte `.jsx` ORIGINAL,
sem minificação:

```python
import re, json, base64, gzip
html = open('docs/toToggle v2.1.html', encoding='utf-8').read()
manifest = json.loads(re.search(r'<script type="__bundler/manifest">(.*?)</script>', html, re.S).group(1))
for uuid, entry in manifest.items():
    raw = base64.b64decode(entry['data'])
    if entry.get('compressed'): raw = gzip.decompress(raw)
    open(f'/tmp/toToggle-proto/{uuid}.{"js" if "javascript" in entry["mime"] else "txt"}', 'w').write(raw.decode('utf-8', 'replace'))
```

Isso produz ~20 arquivos-fonte legíveis (a maioria vendor — React/ReactDOM/Babel standalone — mas
`app.jsx`, `views.jsx`, `users.jsx`, `paths.jsx`, `modals.jsx`, `auth.jsx`, `onboarding.jsx`,
`icons.jsx`, `data.js` são o app real, completo, sem nenhuma sanitização/corte). Foi assim que o
JSX real de `App` (sidebar/topbar/header de `ApplicationDetailScreen` com botão de voltar,
descrição, contador "X/Y active") acabou sendo confirmado — depois de já ter sido perdido pelas
tentativas via design-graph.

**Sugestão de melhoria mais ampla**: já que esse bundle comprimido é a fonte de verdade completa e
já está disponível no export, o design-graph poderia usá-lo diretamente como fonte primária de
indexação (em vez de re-extrair de uma renderização/AST que perde branches condicionais) — isso
resolveria os Achados 1–3 de uma vez, sem exigir o workaround manual.

---

## Achado 5: seleção de protótipo (`set_prototype`) não sobrevive a reconexões do MCP

**Sintoma**: depois de um `/mcp` reconectar a sessão, chamadas subsequentes (`get_component_spec`,
`get_full_jsx`, etc.) sem `doc=` explícito voltam a falhar com `Multiple prototypes loaded... Call
set_prototype(...)`, mesmo já tendo sido chamado antes na mesma sessão de trabalho.

**Sugestão de melhoria**: baixo impacto (contorna-se sempre chamando `set_prototype` de novo ou
passando `doc=` em toda chamada), mas vale documentar explicitamente que a seleção é por-conexão,
não por-sessão-de-tarefa, já que a skill (`design-graph-ui-context`) recomenda chamar só uma vez
"no início da tarefa".

---

## Resumo prático (o que fazer da próxima vez)

1. Pra qualquer componente-raiz com guard clauses (`if (x) return <Y/>` antes do `return`
   principal) — não confiar em `get_full_jsx`/`get_component_spec` sozinhos. Testar
   `validate_component_implementation(name, jsx_source="<div></div>")` primeiro — os textos
   "ausentes" relatados são um sinal rápido de que tem mais conteúdo do que o JSX mostrado.
2. Se ainda faltar detalhe, decodificar o bundle comprimido do HTML do protótipo (Achado 4) — é
   mais confiável que inferir de screenshots.
3. Sempre chamar `set_prototype` no início de CADA sequência de chamadas depois de qualquer
   reconexão do MCP, não só uma vez por tarefa.
