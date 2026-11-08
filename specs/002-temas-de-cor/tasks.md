---

description: "Lista de tarefas dos temas de cor (v1.3)"
---

# Tasks: Temas de cor do palco (v1.3)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: obrigatórios (constituição VI). `test/themes.test.js` roda no `npm test`/CI;
`test/e2e/temas.e2e.js` (Playwright, fora do `package.json`) cobre T01–T10.

**Organization**: US1 = Neon idêntico; US2 = menu e temas; US3 = atalho, persistência, URL;
US4 = acessibilidade e sem servidor. Quase tudo toca `public/index.html`: tarefas nesse arquivo
são sequenciais; [P] só entre arquivos diferentes.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Capturar a referência da v1.2 antes de qualquer mudança: hash do quadro determinístico (rAF congelado, `t = 12345`, 1280×720, sem músicos) = `2ff1a33d` e screenshot `?demo`; registrar em `specs/002-temas-de-cor/research.md` R02 (feito na preparação)
- [X] T002 [P] Criar `test/e2e/temas.e2e.js` (esqueleto): resolve `playwright` (mensagem em português se ausente: "instale com npm i --no-save playwright@1.49.1"), sobe `server.js` numa porta livre (`NIRVA_DOCKER=0`), abre Chrome (`channel: 'chrome'`), coleta erros de console/`pageerror`, helper `frameHash(page, url)` com rAF congelado e `t = 12345`, e relatório "T0x ok/FALHOU"; saída com código 1 se algum falhar

---

## Phase 2: Foundational

- [X] T003 [P] Criar `test/themes.test.js` (T11) — deve falhar: extrair de `public/index.html` o bloco entre `// <themes>` e `// </themes>`, avaliar com `vm` e comparar com `docs/temas-de-cor.json`: mesmos 6 temas na mesma ordem, `deepStrictEqual` de cada tema (ids, `name`, `tagline`, todas as 36 chaves, `crowd` com 4 cores, `floorGrid` só no synthwave), e todo tema tem todas as chaves de `keys`; o tema padrão do código é `default` do JSON
- [X] T004 [P] Em `test/themes.test.js`, teste estático (RF02/FR-019) — deve falhar: fora do bloco `THEMES`, `public/index.html` não contém nenhum dos literais do cenário mapeados no PRD (`#120d20`, `#221a38`, `#1d1631`, `#2b2247`, `#251c3e`, `#140f22`, `#161026`, `#120c1f`, `#0c0816`, `#3a2a24`, `#35261f`, `#2a1d18`, `#2b2233`, `#241c2b`, `#1b1422`, `#3a2f44`, `#1b1318`, `#5a4038`, `#0a0712`, `#3a3848`, `#2c2a38`, `#151019`, `#1b1430`, `#4a2038`, `#1b3c44`, `#0e0b18`, `#120e1f`, `#0b0914`, `#151127`, `#3a2f5a`, `'255,79,163'`, `'62,242,255'`, `6,3,14`); `#2a2233` só pode aparecer no banquinho (1 ocorrência fora do `THEMES`); `#07050d` só no `:root` do CSS como valor inicial de `--bg`; `ACT` e `SESSION_COLORS` iguais aos da v1.2 (valores fixados no teste)
- [X] T005 Em `public/index.html`, adicionar `const THEMES` (cópia fiel de `docs/temas-de-cor.json`, entre `// <themes>` e `// </themes>`), `const THEME_DEFAULT = 'neon'`, `themeById(id)` (desconhecido → neon) e `let theme = themeById(THEME_DEFAULT)` antes de `drawBG`; T003 passa

**Checkpoint**: T11 verde

---

## Phase 3: User Story 1 - Neon idêntico à v1.2 (Priority: P1) 🎯 MVP

**Goal**: todas as cores do cenário vêm de `theme`, com o Neon pixel a pixel igual.

**Independent Test**: T004 verde e hash do quadro = `2ff1a33d` (T01).

- [X] T006 [US1] Em `drawBG()` de `public/index.html`, trocar os literais pelas chaves (tabela do PRD): `wallBase`, `foamA/B`, `foamHiA/B`, `foamLine`, `sideWall`, `brick`, `shelf` + sombra da prateleira `brick` (FR-019), `baseboard`, `floorA/B`, `floorLine`, `riserTop/Line/Face/Edge`, `stageEdge/Hi`, `pit`, `truss`, `trussZig`, `cable`; a função limpa e redesenha o `bg` inteiro a cada chamada
- [X] T007 [US1] Transformar `drawSign` em função nomeada reexecutável: limpa o `sign`, moldura `baseboard` (FR-019), fundo `signBg`, `signA` para NIRVA e `signB` para ROCK; chamar no início junto com `drawBG()`
- [X] T008 [US1] Em `lights()`, usar `theme.washA`/`theme.washB` na lavagem e nos feixes (FR-016); em `leds()`, `ledRiserOn/Off` e `ledEdgeOn/Off`
- [X] T009 [US1] Plateia: `crowd` guarda o índice `i` (sem cor fixa) e `drawCrowd()` usa `theme.crowd[c.i % 4]` e `theme.crowdRim`; `render()` usa `rgba(${theme.overlay},…)` e `theme.pageBg` no `fillRect`; `--bg` do `:root` recebe `theme.pageBg`
- [X] T010 [US1] Rodar `npm test` (T004 verde, demais verdes) e o e2e T01 (hash `2ff1a33d` sem tema salvo); se diferente, corrigir até igualar

**Checkpoint**: Neon idêntico à v1.2 com cores vindas do tema

---

## Phase 4: User Story 2 - Menu e os 6 temas (Priority: P2)

**Goal**: escolher qualquer tema no menu, com troca instantânea e banda intacta.

**Independent Test**: e2e T02, T07, T09.

- [X] T011 [US2] Em `test/e2e/temas.e2e.js`, implementar T02 (cada tema pelo menu: hash do quadro muda, `data-theme` = id, swatches de atividade da legenda iguais; SC-002: tempo síncrono do clique até `data-theme` mudar < 50 ms), T07 (demo: nº de músicos/sessões e texto da conexão iguais antes/depois de 6 trocas, sem erro) e T09 (synthwave × neon no quadro determinístico, escala 2: nas colunas lógicas x = 20k da área do chão, o pixel difere do vizinho x = 20k + 10 na mesma linha em ≥ 80% das linhas amostradas com synthwave e em ≤ 30% com neon) — deve falhar
- [X] T012 [US2] Implementar `applyTheme(id, { save = false } = {})` em `public/index.html` (R03): resolve, atribui `theme`, `drawBG()`, `drawSign()`, atualiza `--bg`, `document.documentElement.dataset.theme`, ✓/`aria-checked` do menu; salva com `store.set('theme', id)` se `save`; nunca toca `sessions`, `members`, `particles`, `occ`, `coxia` nem a conexão
- [X] T013 [US2] Chão em grade (FR-005/FR-018): em `drawBG()`, com `theme.floorGrid`, `floorA` em toda a área do chão e linhas `floorLine` horizontais a cada 12 px e verticais a cada 20 px
- [X] T014 [US2] Botão `#bTheme` 🎨 antes do `#bSound` (title "Tema do palco (C)", `aria-haspopup="menu"`, `aria-expanded`) e `#themeMenu.panel` (`role="menu"`) com uma linha por tema: `canvas` 64×36 (parede `wallBase`/`foamA`, letreiro `signBg` com faixas `signA` e `signB`, chão `floorA`/`floorLine`), nome, tagline e ✓; CSS no `<style>` existente; clique aplica e salva, fecha; clique fora fecha
- [X] T015 [US2] Rodar `npm test` e e2e T01, T02, T07, T09 até passar

---

## Phase 5: User Story 3 - Atalho, persistência e URL (Priority: P3)

**Independent Test**: e2e T03–T06.

- [X] T016 [US3] Em `test/e2e/temas.e2e.js`, implementar T03 (escolhe `jazz`, recarrega, continua), T04 (`?theme=hacker` aplica e não grava), T05 (`?theme=xyz` e `nirva:theme` corrompido → neon, sem erro) e T06 (`C` × 6 percorre e volta, aviso "🎨 <nome>" visível; Ctrl+C não troca) — deve falhar
- [X] T017 [US3] Inicialização: `applyTheme(params.get('theme') || store.get('theme', THEME_DEFAULT))` sem salvar (R05); mover `params` para antes do uso se necessário, sem mudar a lógica de conexão
- [X] T018 [US3] Tecla `C` no `keydown` existente (Ctrl/Cmd/Alt+C não troca): próximo tema com volta, `save: true`, aviso `#themeToast.panel` (`role="status"`) centralizado na base da tela por 1,5 s, reiniciando o timer (FR-012/FR-020)
- [X] T019 [US3] Rodar `npm test` e e2e T01–T07, T09 até passar

---

## Phase 6: User Story 4 - Acessibilidade e sem servidor (Priority: P4)

**Independent Test**: e2e T08, T10.

- [X] T020 [US4] Em `test/e2e/temas.e2e.js`, implementar T08 (só teclado: foco no 🎨, `Enter` abre com foco no ativo, ↓ e `Enter` aplicam, `aria-checked` atualiza, reabrir e `Esc` fecha devolvendo o foco) e T10 (abrir `public/index.html` via `file://`: demo liga, menu e `C` funcionam, sem erro) — deve falhar
- [X] T021 [US4] Teclado do menu (R06): roving `tabindex`, ↑/↓ com volta, Home/End, `Enter`/espaço aplica e fecha, `Esc` fecha e devolve o foco; com o menu aberto, atalhos globais de uma letra ficam inativos
- [X] T022 [US4] Rodar `npm test` e e2e T01–T10 até passar

---

## Phase 7: Polish

- [X] T023 [P] Legenda (`H`) em `public/index.html`: incluir `<kbd>C</kbd> tema` e o menu 🎨 nos atalhos; teste em `test/themes.test.js` (legenda contém `<kbd>C</kbd>` e 🎨)
- [X] T024 [P] `README.md`: seção do palco e atalhos com a tecla `C`, o menu 🎨, os 6 temas e `?theme=<id>`; changelog 1.3.0; teste em `test/themes.test.js` (README cita `C`, 🎨, `?theme=` e os 6 nomes)
- [X] T025 Rodar o e2e completo, que gera `docs/temas/<id>.png` dos 6 temas; conferir visualmente; comparar `neon` com o screenshot `?demo` da v1.2
- [ ] T026 Rodar a bateria completa: `npm test`, e2e T01–T10, e com o servidor ligado `npm run doctor` e `npm run test-event`
- [ ] T027 Commits pequenos ao longo das fases, na branch atual, sem push nem merge

## Dependencies & Execution Order

- Setup → Foundational (T003/T004 antes de T005) → US1 → US2 → US3 → US4 → Polish
- `public/index.html`: T005 → T006 → T007 → T008 → T009 → T012 → T013 → T014 → T017 → T018 → T021 → T023 (sequenciais)
- [P]: T002 com T003/T004; T024 com T023 e com qualquer tarefa de `index.html`

## Implementation Strategy

MVP = US1 (Neon idêntico com cores vindas do tema). Depois US2 (menu), US3 (atalho, persistência,
URL), US4 (teclado e sem servidor). Rodar todos os testes ao fim de cada fase; não avançar com
teste quebrado.
