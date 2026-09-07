# Dossiê: componentes inacessíveis via design-graph no protótipo `toToggle`

> **RESOLVIDO** (2026-09-06): o usuário atualizou/reindexou o design-graph e pediu pra reverificar.
> Todos os 6 componentes listados abaixo como "falharam" agora extraem normalmente via
> `get_full_jsx` — reproduzido e confirmado nesta mesma sessão (`set_prototype(name="toToggle")`,
> depois cada `get_full_jsx(name=...)` individualmente). A causa raiz exata dentro do design-graph
> não é visível a partir desta sessão (não temos acesso ao código-fonte da ferramenta aqui) — o
> conteúdo abaixo fica como registro histórico do sintoma e das hipóteses que motivaram a correção,
> e a seção "O que foi confirmado depois do conserto" no final documenta o resultado observado.
>
> Prompt original, escrito para outro agente investigar e propor melhorias no MCP `design-graph`,
> depois de uma sessão de trabalho no monorepo `toToggles`
> (`/Users/manoelmedeiros/Workspace/toToggles`) em que várias tentativas de extrair o JSX de
> componentes específicos do protótipo carregado (`toToggle`) falhavam, mesmo com as ferramentas
> mais completas (`get_full_jsx`), enquanto outros componentes aparentemente equivalentes em
> profundidade/contexto funcionavam perfeitamente. Isso estava relacionado ao Achado 1 do documento
> irmão `docs/investigation/design-graph-findings.md`, mas descrevia um padrão diferente e mais
> específico que aquele achado não explicava sozinho — ver seção "Por que isto não era só o
> Achado 1".

---

## Missão original (mantida como registro — já não é mais necessária)

Investigar por que o MCP `design-graph` conseguia extrair o JSX completo de alguns componentes de
um protótipo React exportado como HTML autocontido, mas falhava silenciosamente (com uma mensagem
genérica) para outros componentes do MESMO protótipo, aparentemente no mesmo nível de
profundidade/complexidade estrutural.

## O sintoma, com reprodução exata (como estava ANTES do conserto)

Nesta ordem, com `set_prototype(name="toToggle")` já chamado:

### Falharam (todos com a mesma mensagem genérica)

```
get_full_jsx(name="CommandPalette")
→ "JSX completo não disponível para 'CommandPalette'. Rode: design-graph --force <proto.html>"

get_full_jsx(name="TogglePaths")
→ "JSX completo não disponível para 'TogglePaths'. Rode: design-graph --force <proto.html>"

get_full_jsx(name="OnboardingModal")
→ "JSX completo não disponível para 'OnboardingModal'. Rode: design-graph --force <proto.html>"

get_full_jsx(name="ToggleCard")
→ "JSX completo não disponível para 'ToggleCard'. Rode: design-graph --force <proto.html>"

get_full_jsx(name="SuggestChangeModal")
→ "JSX completo não disponível para 'SuggestChangeModal'. Rode: design-graph --force <proto.html>"

get_full_jsx(name="ActivityView")
→ "JSX completo não disponível para 'ActivityView'. Rode: design-graph --force <proto.html>"
```

### Funcionaram perfeitamente (JSX completo devolvido)

```
get_full_jsx(name="AppList")              → sucesso, JSX completo, ~15 linhas
get_full_jsx(name="AppModal")             → sucesso, JSX completo
get_full_jsx(name="ApprovalInterceptModal") → sucesso, JSX completo
get_full_jsx(name="ArchivedModal")        → sucesso, JSX completo
get_full_jsx(name="KeysView")             → sucesso, JSX completo
get_full_jsx(name="MemberRow")            → sucesso, JSX completo
get_full_jsx(name="UserRow")              → sucesso, JSX completo (via get_screen_full também)
get_full_jsx(name="UserModal")            → sucesso, JSX completo
get_full_jsx(name="TempPasswordModal")    → sucesso, JSX completo
get_full_jsx(name="UsersView")            → sucesso (get_screen_full)
get_full_jsx(name="ApprovalsView")        → sucesso (get_screen_full), inclui um trecho sanitizado
get_full_jsx(name="ApprovalRow")          → sucesso, mas SANITIZADO (ver nota abaixo)
get_component_spec(name="MemberRow")      → sucesso, lista de Textos completa e correta
```

**Nota sobre "sanitizado"**: `ApprovalRow` e o `.jsx` de dentro de `get_screen_full("ApprovalsView")`
vinham com um aviso explícito: *"Este snippet já passou por `sanitize_jsx` na extração — handlers
longos e ramos de lista/condicional/ternária foram substituídos por marcadores [conditional:X],
[list:Y], [return_branch:N]. Chamar `get_full_jsx` de novo não recupera o restante: o texto
original não fica armazenado."* — ou seja, esses NÃO falhavam, mas devolviam uma versão com partes
deliberadamente cortadas e sinalizadas como tal. Essa categoria de resultado ainda existe hoje
(depois do conserto): `TogglePaths` e `OnboardingModal`, por exemplo, agora extraem com sucesso mas
continuam vindo sanitizados — o conserto resolveu a falha total ("não disponível"), não a
sanitização parcial, que parece ser um comportamento intencional e separado.

### Achado extra que aumentava o mistério: um componente "falho" aparecia no grafo mesmo assim

```
list_screens()
```
devolvia, entre outras, esta entrada pro protótipo `toToggle`:
```
**HistoryView** (23 componentes)
  → ActivityView, AppCard, AppList, AppModal, ApprovalRow, ...
```

Ou seja: o design-graph SABIA que `ActivityView` existia e pertencia à árvore de componentes de
`HistoryView` (a relação de pertencimento tinha sido indexada com sucesso), mas
`get_full_jsx("ActivityView")` falhava ao extrair o próprio JSX dele.

## Por que isto não era só o Achado 1 (`docs/investigation/design-graph-findings.md`)

O Achado 1 documenta que `App` (o componente raiz, com guard clauses tipo
`if (firstLogin) return <FirstLoginScreen/>` antes do `return` principal) só expõe o PRIMEIRO
branch, nunca o corpo autenticado principal — e por isso conclui que "tudo que só existe dentro da
árvore autenticada de `App`" é inacessível. Os resultados desta sessão contradiziam essa
generalização: uma dúzia de componentes que vivem exclusivamente dentro dessa mesma árvore
autenticada extraíam perfeitamente, então "estar dentro da árvore pós-login de `App`" nunca foi,
sozinho, o que predizia falha.

## O que foi confirmado depois do conserto

Reproduzido nesta sessão, com `set_prototype(name="toToggle")` (a ferramenta reportou
`"Active prototype set to 'toToggle v2.6'"`, sugerindo uma reindexação/atualização de versão):
todos os 6 `get_full_jsx` que antes falhavam agora devolvem JSX completo (ou sanitizado, nunca
mais "não disponível"). Isso permitiu uma comparação real contra o que já tinha sido construído no
frontend deste monorepo (`server/web/src/`) — resultado registrado em `server/CLAUDE.md`, seção
"v2.6 §8 — Phase 6": a maioria dos componentes já batia 1:1 (tinham sido construídos corretamente
via decodificação do bundle numa fase anterior, antes da diretiva atual de só usar design-graph),
mas `ActivityView` revelou um gap real de feature (filtro de categoria/intervalo + Export CSV que a
Activity tab de uma aplicação nunca teve, por nunca ter sido possível ver a fonte real antes) —
corrigido de ponta a ponta (backend + frontend + testes) na mesma sessão.

Se uma futura sessão quiser entender a causa raiz de verdade (por que esses 6 especificamente
falhavam, e o que a atualização mudou), as hipóteses abaixo continuam sendo o ponto de partida —
elas nunca chegaram a ser confirmadas ou descartadas, só contornadas pela reindexação.

## Hipóteses (nunca confirmadas — o conserto veio de uma atualização externa da ferramenta, não de um diagnóstico feito aqui)

1. **Estilo de declaração do componente**: `const X = (props) => {...}` vs.
   `function X(props) {...}` no bundle decodificado.
2. **Tamanho/complexidade do corpo**: os que falhavam eram, em geral, maiores/mais complexos
   (`CommandPalette`, `TogglePaths` cruzam múltiplas entidades ou têm seleção múltipla).
3. **Hooks/estado usados**: `useEffect` com dependências complexas, closures sobre múltiplos
   handlers, padrões de render prop/HOC.
4. **Posição no arquivo-fonte**: os que falhavam ficavam definidos depois de um certo ponto no
   arquivo, sugerindo um limite de parsing/timeout.
5. **Índice desatualizado/parcial em cache** — a mensagem de erro sugeria `design-graph --force
   <proto.html>` como próximo passo; a reindexação que efetivamente resolveu o problema é
   consistente com essa hipótese tendo sido a causa real o tempo todo (um simples re-index, não um
   bug estrutural no crawler).
