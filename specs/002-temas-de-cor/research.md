# Pesquisa e decisões: Temas de cor (v1.3)

Sem `NEEDS CLARIFICATION` abertos; ver [spec.md › Clarifications](spec.md#clarifications).

## R01. Onde ficam os temas e como o T11 os lê

- **Decisão**: `const THEMES = [...]` em `public/index.html`, entre os marcadores `// <themes>` e
  `// </themes>`, como literal JSON-compatível. O teste extrai o bloco e o avalia com `vm`, e
  compara com `docs/temas-de-cor.json` (`deepStrictEqual` de `themes`), além de `default`.
- **Justificativa**: PRD exige os temas dentro do `index.html` (lista fechada de estáticos do
  servidor). Mesmo padrão já usado para `projName` (`test/multi-host.test.js`).
- **Alternativas**: servir o JSON (arquivo estático novo, proibido); gerar o HTML num build (sem
  build no projeto).

## R02. Prova de fidelidade do Neon (T01)

- **Decisão**: antes de qualquer mudança, capturar com Playwright um quadro determinístico da v1.2
  (rAF congelado, um único quadro com `t = 12345 ms`, sem músicos) e guardar o hash FNV dos pixels
  do canvas visível (1280×720): `2ff1a33d`. Depois da mudança, o mesmo quadro com tema Neon tem de
  dar o mesmo hash. Complemento visual: screenshot `?demo` antes/depois.
- **Justificativa**: o demo é aleatório; um quadro com t fixo cobre `bg`, `sign`, `lights`,
  `leds`, plateia, `overlay` e `pageBg`.

## R03. Troca de tema sem perder estado

- **Decisão**: `let theme` (objeto ativo). `applyTheme(id, { save })` resolve o id (inválido →
  `neon`), atribui `theme`, chama `drawBG()` e `drawSign()`, atualiza `--bg` no `:root` e o ✓ do
  menu. Não toca `sessions`, `members`, `particles`, `occ`, `coxia` nem `EventSource`.
  `lights/leds/drawCrowd/render` leem `theme` a cada quadro (só leituras de propriedade).
- **Plateia**: `crowd` guarda o índice `i`; a cor vem de `theme.crowd[i % 4]` na hora de desenhar.

## R04. Chão em grade

- **Decisão**: com `theme.floorGrid`, preencher a área do chão (y 200–325) com `floorA`, linhas
  horizontais a cada 12 px e verticais a cada 20 px em `floorLine` (clarificação FR-018). Sem
  `floorGrid`, as tábuas atuais com `floorA/floorB/floorLine`.

## R05. Persistência e URL

- **Decisão**: no início, `id = params.get('theme') || store.get('theme', 'neon')`; aplica sem
  salvar. Escolha no menu ou com `C` → `applyTheme(id, { save: true })` → `store.set('theme', id)`.
  `store.get` já tem try/catch e faz `JSON.parse`; valor corrompido (JSON inválido) devolve o
  padrão; id desconhecido cai em `neon`.

## R06. Menu acessível

- **Decisão**: botão `#bTheme` (🎨, title "Tema do palco (C)") antes do `#bSound`. Painel
  `#themeMenu.panel` com `role="menu"`, posicionado abaixo do `#ctrl`, à direita. Cada linha é um
  `button` com `role="menuitemradio"`, `aria-checked`, `tabindex` controlado (roving), miniatura
  `canvas` 64×36 desenhada com as cores do tema, nome e tagline. Teclas: ↑/↓ (com volta), Home/End,
  `Enter`/espaço escolhe, `Esc` fecha e devolve o foco ao botão; clique fora fecha. Enquanto o menu
  está aberto, os atalhos globais de uma letra ficam inativos, exceto `Esc`.

## R07. Atalho `C` e aviso

- **Decisão**: no `keydown` existente (que já ignora Ctrl/Cmd/Alt), `c` → próximo tema na ordem
  de `THEMES`, com volta, salva e mostra `#themeToast.panel` "🎨 <nome>" por 1,5 s (reinicia o
  timer). Posição: centralizado na base da tela, para não cobrir o letreiro (FR-020).

## R08. Screenshots e e2e

- **Decisão**: `test/e2e/temas.e2e.js` (Playwright, Chrome do sistema via `channel: 'chrome'`)
  sobe o próprio `server.js` numa porta livre, roda T01–T10 e salva `docs/temas/<id>.png`
  (`?demo&theme=<id>`, 1280×720, após ~6 s de demo, fora da "falha" do letreiro em ~4 s). Executado com
  `NODE_PATH=<pasta com playwright>/node_modules node test/e2e/temas.e2e.js` ou depois de
  `npm i --no-save playwright`. Não entra no `package.json`.
