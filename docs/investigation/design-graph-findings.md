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

> **RESOLVIDO** (2026-09-06): depois de uma atualização/reindexação do design-graph pedida pelo
> usuário, `get_full_jsx("App")` e `get_component_spec("App")` agora devolvem **todos** os
> branches, cada um rotulado explicitamente: `{[return_branch:1]}` (o `FirstLoginScreen`),
> `{[return_branch:2]}` (o `LoginScreen`), `{[return_branch:default]}` (a shell autenticada
> inteira — sidebar, topbar, roteamento de view). Exatamente a melhoria sugerida na opção (a)
> abaixo. Reproduzido e confirmado nesta sessão; ver também
> `docs/investigation/design-graph-unreachable-components.md`, que documenta um problema
> relacionado (6 componentes específicos que falhavam com "JSX completo não disponível") corrigido
> pela mesma atualização.

**Sintoma (histórico, como estava antes do conserto)**: `get_full_jsx("App")` e
`get_component_spec("App")` sempre devolviam só

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

> **RESOLVIDO** (2026-09-07): uma nova atualização do design-graph trouxe duas tools novas,
> exatamente a sugestão de melhoria pedida abaixo — `get_full_texts(name)` (o `get_full_styles`
> equivalente pra textos, sem corte) e `get_component_data(name)` (devolve o conteúdo COMPLETO e
> sem corte de qualquer constante em nível de módulo que o corpo do componente referencia por
> nome — ex.: o mapa `ICONS[name] -> path SVG`, ou uma tabela `role -> badge`). Testado e
> confirmado: `get_full_texts(name="ApprovalRow")` devolve os 5 textos sem nenhum "+N mais";
> `get_component_data(name="Icon")` devolveu o mapa `ICONS` inteiro do `icons.jsx` real — 30+
> glifos com o `d` (path SVG) exato de cada um, nunca antes visível pelo design-graph (só o USO
> `<Icon name="X"/>` aparecia, nunca o path em si). Isso fechou de vez o workaround do Achado 4
> especificamente pra dados referenciados (ICONS e afins) — não precisa mais decodificar o bundle
> pra confirmar um path de ícone.
>
> **Ressalva histórica — ver Achado 6 (RESOLVIDO em 2026-09-08)**: por um tempo,
> `get_full_texts`/`get_component_data` erravam a resolução de nome quando o nome pedido era
> PREFIXO de outros nomes de componente (ex.: `name="App"` resolvia pro componente errado,
> `AppStep`, em vez do componente raiz `App`). Já não reproduz mais — `name="App"` resolve certo
> agora, incluindo pra `App` sendo uma tela (screen), não só um componente comum.

**Sintoma histórico (como estava antes do conserto)**: `get_component_spec("App")` devolvia só 8
textos com `> ... +7 mais` no final — sem nenhum parâmetro pra pedir os +7 restantes. O mesmo
valia pra "Estilos — default" (`+13 mais` / `+24 mais` dependendo da chamada).

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

**Sugestão de melhoria (implementada)**: uma tool dedicada pra listar textos sem corte — é
exatamente o que `get_full_texts` faz hoje (ver nota de resolução no topo deste achado).

---

## Achado 3: `get_section` não existe pra componentes fora da lista de "telas"

> **RESOLVIDO** (2026-09-07): numa terceira atualização do design-graph nesta mesma sessão, `App`
> passou a aparecer em `list_screens()` (24 componentes, 7 seções: Sidebar, Topbar, Page, Confirm
> app row, Skey warn ×2, Toast) e `get_section(screen="App", section="sidebar")`/`section="Page"`
> agora devolvem dados reais em vez do erro "Seção não encontrada". Usado ao vivo nesta sessão pra
> confirmar e corrigir dois gaps reais na reescrita: o botão de nav "Search ⌘K" que faltava em
> `AppShell.tsx` e o branch de page-desc da aba Activity que faltava em
> `ApplicationDetailScreen.tsx` (ver `server/CLAUDE.md`, bullet "v2.6 §8", pra detalhe). A
> observação abaixo (duplicação de protótipo sob dois nomes) não foi reverificada nesta rodada —
> segue como possível pendência à parte.
>
> **Observação (ainda não reverificada)**: numa rodada anterior, `list_screens()` chegou a listar
> o mesmo conjunto de telas duas vezes, sob dois nomes de protótipo diferentes — `toToggle` e
> `toToggle v2.6` — com conteúdo idêntico. `set_prototype(name="toToggle")` respondia `"Active
> prototype set to 'toToggle v2.6'"` (parece resolver/redirecionar pro nome novo). Não ficou claro
> se isso era intencional (versionamento) ou um resíduo da reindexação — vale reconferir numa
> próxima sessão, já que duplicar todo o grafo por versão pode mascarar buscas futuras (ex.:
> `search()` pode devolver o mesmo componente duas vezes, uma por doc).

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

> **Status** (atualizado em 2026-09-07): os Achados 1 e 2 foram resolvidos por duas atualizações
> sucessivas do design-graph (não confirmamos os detalhes internos — não temos acesso ao código da
> ferramenta). O Achado 3 (`App`/telas-raiz fora de `list_screens`) continua aberto — o workaround
> manual (decodificar o bundle) ainda seria necessário só pra esse caso específico, mas lembre da
> diretriz atual do projeto (`CLAUDE.md`): só decodificar o HTML manualmente quando o design-graph
> genuinamente não tiver a informação (tentando `get_full_jsx`/`get_component_data` primeiro),
> nunca como primeira opção.

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

## Achado 6: `get_full_texts`/`get_component_data` resolviam o nome errado quando ele era prefixo de outro componente

> **RESOLVIDO** (2026-09-08, reverificado ao vivo depois de um novo reconnect do MCP):
> `get_full_texts(name="App")` agora devolve corretamente `"# Textos completos: App"` — uma lista
> enorme (centenas de entradas, cada uma já rotulada com o componente-filho de origem: Sidebar,
> Topbar, AppCard, AppModal, EditDrawer, MemberModal, NewToggleModal, ToggleCard, TogglePaths,
> UserModal, etc.), cobrindo a árvore autenticada inteira de `App` de uma vez — não mais os 4
> textos isolados de `AppStep`. `get_component_data(name="App")` também parou de resolver errado:
> agora devolve uma mensagem própria e correta, `"'App' é uma tela; dados referenciados de módulo
> ainda só estão disponíveis para componentes"` — reconhece `App` como screen (não confunde mais
> com `AppStep`), só não expõe esse recurso específico pra screens ainda (limitação diferente,
> documentada com clareza em vez de silenciosamente devolver o componente errado).

**Sintoma histórico (como estava antes do conserto)**: `get_full_texts(name="App")` (e o mesmo com
`doc="toToggle v2.6"` explícito) devolvia `"# Textos completos: AppStep"` — o componente `AppStep`
(uma tela do onboarding wizard), não o componente raiz `App` que foi pedido. `App` é prefixo de
vários outros nomes reais no mesmo protótipo (`AppStep`, `AppList`, `AppModal`, `AppCard`), e o
resolver escolhia um desses em vez de priorizar o match EXATO quando ele existia.

**Confirmado que não era geral**: `get_full_texts(name="MemberRow")` e
`get_full_texts(name="ApprovalRow")` já resolviam corretamente pros componentes exatos — nenhum
dos dois tinha outro nome de componente como prefixo/sufixo no mesmo protótipo. O problema era
específico de nomes ambíguos por prefixo, e parece ter sido corrigido nesse escopo exato.

**Comando pra reproduzir**:
```
set_prototype(name="toToggle")
get_full_texts(name="App")
→ "# Textos completos: AppStep" (errado — devia ser "App")
get_full_texts(name="MemberRow")
→ "# Textos completos: MemberRow" (correto, sem ambiguidade de nome)
```

**Sugestão de melhoria**: priorizar SEMPRE um match exato de nome sobre qualquer match
parcial/prefixo, nas tools que aceitam nome de componente — mesmo problema pode existir em outras
tools além de `get_full_texts`/`get_component_data` (não testamos exaustivamente todas). Um efeito
colateral chato: como o resultado vem com um cabeçalho dizendo qual componente foi de fato
resolvido (`"# Textos completos: AppStep"`), dá pra perceber o erro — mas só se quem chamou
prestar atenção nesse cabeçalho em vez de assumir que o `name` pedido foi respeitado.

---

## Resumo prático (o que fazer da próxima vez, atualizado em 2026-09-08)

1. `get_full_jsx(name)` já devolve TODOS os branches de retorno de um componente com múltiplos
   `return` (rotulados `{[return_branch:N]}`/`{[return_branch:default]}`) — não precisa mais do
   workaround de `validate_component_implementation` pra detectar isso (Achado 1, resolvido).
2. Pra texto sem corte, use `get_full_texts(name)`; pra qualquer constante em nível de módulo que
   o componente referencia (mapas de ícone, badge, etc.), use `get_component_data(name)` — ambos
   sem "+N mais" (Achado 2, resolvido). A resolução de nomes ambíguos por prefixo (ex.: `"App"`
   vs. `"AppStep"`) também foi corrigida (Achado 6, resolvido) — confiar direto no cabeçalho da
   resposta já basta agora, sem precisar de checagem extra.
3. `App` (e telas-raiz equivalentes) agora aparece em `list_screens()`, com `get_section`
   funcionando pra suas seções internas (Achado 3, resolvido) — mas `get_full_jsx`/
   `get_component_spec` direto pelo nome do componente continuam válidos como alternativa.
4. Se AINDA faltar detalhe depois de tentar tudo acima, decodificar o bundle comprimido do HTML do
   protótipo (Achado 4) continua sendo o último recurso — mas cada vez menos necessário.
5. Sempre chamar `set_prototype` no início de CADA sequência de chamadas depois de qualquer
   reconexão do MCP, não só uma vez por tarefa (Achado 5, não retestado nesta rodada).
