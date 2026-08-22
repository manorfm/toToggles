---
name: design-graph-frontend
description: Regras obrigatórias para qualquer trabalho de frontend/UI no ToToggle — consultar o MCP design-graph antes de criar ou alterar telas, já que o design system foi totalmente reformulado e o protótipo é a fonte de verdade.
---

# Frontend do ToToggle — sempre via design-graph

O frontend do ToToggle está sendo **completamente reescrito**. O design system antigo (`server/static/*.html`, `script.js`, `styles.css`) foi descontinuado e reformulado do zero. O novo design vive em um protótipo carregado no MCP `design-graph` — **não no código legado**.

## Regra obrigatória

Antes de criar, alterar ou revisar qualquer tela, componente ou estilo do frontend, **sempre**:

1. `mcp__design-graph__set_prototype` — selecione o protótipo do ToToggle (o servidor MCP pode ter mais de um protótipo carregado por outros projetos).
2. `mcp__design-graph__list_screens` ou `mcp__design-graph__search` — encontre a tela/componente relevante para a tarefa.
3. `mcp__design-graph__get_screen_full` (tela inteira) ou `mcp__design-graph__get_component_spec` (componente isolado) — reconstrua a especificação real antes de escrever qualquer JSX/HTML/CSS.
4. Use `mcp__design-graph__get_tokens` e `mcp__design-graph__find_token_usage` para cores, espaçamento, tipografia — nunca invente valores visuais nem reaproveite os do `styles.css` antigo.
5. Para mudanças que afetam múltiplos lugares, use `mcp__design-graph__impact` antes de aplicar, para não quebrar telas que compartilham o mesmo componente/token.

## Por que isso importa

- O `styles.css`/`script.js` antigos (~12k linhas somadas) são exatamente o problema que está sendo resolvido: um arquivo gigante, difícil de manter e desatualizado em relação ao novo design. Copiar padrões de lá é reintroduzir o problema.
- O protótipo no design-graph reflete decisões de design já tomadas (tokens, componentes, layout) — perguntar ao design-graph é mais barato e mais correto do que adivinhar ou redesenhar.
- Ignorar essa consulta é a causa mais provável de UI inconsistente com o resto do produto reformulado.

## Quando pular

Se a tarefa é puramente de backend (Go/Gin/GORM) e não toca em nada servido como HTML/CSS/JS, ou se a pergunta do usuário não tem relação com telas/UI, essa regra não se aplica.
