# PRD — Nirva Stage: Temas de cor do palco (v1.3)

2026-11-07 · Oscar Casagrande

## Resumo

O palco ganha um **seletor de tema**: um botão 🎨 abre um menu com 6 paletas, e a escolha troca na hora as cores do cenário (parede, letreiro, luzes, chão, LEDs e plateia) sem recarregar a página nem perder o estado da banda.

As paletas exatas estão em [`docs/temas-de-cor.json`](./temas-de-cor.json), que é a fonte da verdade. O tema `neon` reproduz as cores atuais.

## Objetivos e fora de escopo

**Objetivos**

1. Seis temas: Neon noturno (padrão), Synthwave, Garagem grunge, Arena gelo, Terminal hacker e Clube de jazz.
2. Troca instantânea, com o estado da banda, as partículas e a conexão SSE intactos.
3. Escolha lembrada por navegador (localStorage) e atalho de teclado.
4. Zero dependências novas; continua funcionando aberto como arquivo ou como página publicada (modo demo).

**Fora de escopo**

- As cores das atividades (`ACT`: azul leitura, rosa escrita, âmbar permissão…) **não mudam**, porque carregam significado.
- As cores das sessões (`SESSION_COLORS`: fita no chão e borda do nome) **não mudam**.
- Personagens, instrumentos, pôsteres, amplificadores e o HUD em HTML continuam iguais.
- Temas criados pelo usuário, editor de cores e sincronização entre navegadores ou máquinas.

## Experiência

- **Botão:** 🎨 no `#ctrl`, antes do 🔇, com o title "Tema do palco (C)".
- **Menu:** um painel (`.panel`) ancorado no botão, com uma linha por tema: miniatura de 64×36 px (parede, letreiro com as duas cores e chão), nome, descrição curta (`tagline`) e uma marca ✓ no tema ativo.
- **Comportamento do menu:** fecha ao escolher, com `Esc` ou ao clicar fora. Navegável por teclado (setas, `Enter`), com `role="menu"` e `role="menuitemradio"` + `aria-checked`.
- **Atalho:** a tecla `C` avança para o próximo tema, ciclando. Ao trocar, aparece um aviso discreto com o nome do tema por 1,5 s, no padrão visual dos painéis existentes.
- **Legenda (`H`):** passa a listar o atalho `C`.

## Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF01 | `public/index.html` define `const THEMES` com os 6 temas, copiados de `docs/temas-de-cor.json` (mesmos ids, nomes, taglines e cores). |
| RF02 | Toda cor do cenário listada em `keys` do JSON deixa de ser literal no código e passa a vir do tema ativo (objeto `theme`). |
| RF03 | `drawBG()` lê as cores do tema e pode ser chamada de novo a qualquer momento; trocar de tema redesenha o `bg` e o canvas do letreiro (`sign`). |
| RF04 | `lights()`, `leds()`, `drawCrowd()`, o escurecimento do ambiente (`overlay`), o fundo da página (`pageBg`, inclusive no `fillRect` do render e no `body`) e as prateleiras usam o tema ativo. |
| RF05 | Com `floorGrid: true` (Synthwave), o chão é desenhado como grade (linhas horizontais e verticais em `floorLine` sobre `floorA`), não como tábuas. |
| RF06 | A escolha fica salva com o `store` existente (`nirva:theme`, com try/catch); um id inválido ou ausente cai em `neon`. |
| RF07 | Parâmetro `?theme=<id>` na URL força o tema ao abrir, sem gravar no localStorage. Serve para demo e para gravar vídeo. |
| RF08 | O menu e o atalho `C` funcionam também no modo demo e na página publicada (sem servidor). |
| RF09 | Trocar de tema não reinicia a conexão SSE, não limpa `sessions` nem `members` e não perde partículas. |

## Requisitos não funcionais

- **Desempenho:** a troca leva menos de 50 ms (um redesenho do `bg` de 640×360). Nada é recalculado por quadro além do que já é hoje.
- **Fidelidade:** com o tema `neon`, o palco fica pixel a pixel igual ao da v1.2 (mesmas cores e posições).
- **Código:** sem dependências e sem arquivos estáticos novos. Os temas ficam dentro do `index.html`, para não mexer na lista fechada de arquivos do `server.js`.
- **Acessibilidade:** o menu é operável só pelo teclado; o tema ativo é anunciado (`aria-checked`); o contraste do texto do HUD não muda.

## Mapeamento para o código atual

Cada chave do JSON substitui um literal existente em `public/index.html`:

| Onde | Literais atuais → chave |
| --- | --- |
| `drawBG()`, fundo e espuma | `#120d20` → `wallBase`; `#221a38`/`#1d1631` → `foamA`/`foamB`; `#2b2247`/`#251c3e` → `foamHiA`/`foamHiB`; `#140f22` → `foamLine` |
| `drawBG()`, laterais e prateleiras | `#161026` → `sideWall`; `#120c1f` → `brick`; `#2a2233` (prateleira) → `shelf`; `#0c0816` → `baseboard` |
| `drawBG()`, chão e praticável | `#3a2a24`/`#35261f` → `floorA`/`floorB`; `#2a1d18` → `floorLine`; `#2b2233`/`#241c2b`/`#1b1422`/`#3a2f44` → `riserTop`/`riserLine`/`riserFace`/`riserEdge` |
| `drawBG()`, borda, treliça e cabos | `#1b1318`/`#5a4038` → `stageEdge`/`stageEdgeHi`; `#0a0712` → `pit`; `#3a3848`/`#2c2a38` → `truss`/`trussZig`; `#151019` → `cable` |
| `drawSign()` | `#1b1430` → `signBg`; `#ff4fa3`/`#3ef2ff` → `signA`/`signB` (vira função chamada na troca) |
| `lights()` | `'255,79,163'`/`'62,242,255'` → `washA`/`washB` |
| `leds()` | `#ff4fa3`/`#4a2038` → `ledRiserOn`/`ledRiserOff`; `#3ef2ff`/`#1b3c44` → `ledEdgeOn`/`ledEdgeOff` |
| plateia | array de cores do `crowd` → `crowd[i % 4]` lido na hora de desenhar; `#3a2f5a` → `crowdRim` |
| `render()` | `rgba(6,3,14,…)` → `rgba(${overlay},…)`; `#07050d` → `pageBg` |

## Critérios de aceite e testes

| # | Teste | Esperado |
| --- | --- | --- |
| T01 | Abrir sem tema salvo | tema `neon`, visual idêntico à v1.2 (comparar screenshot) |
| T02 | Escolher cada um dos 6 temas no menu | parede, letreiro, luzes de fundo, LEDs, chão, plateia e fundo da página mudam; personagens e cores de atividade não |
| T03 | Recarregar a página | tema escolhido continua ativo |
| T04 | `?theme=hacker` | abre no Terminal hacker sem gravar no localStorage |
| T05 | `?theme=xyz` e localStorage corrompido | cai em `neon` sem erro no console |
| T06 | Tecla `C` seis vezes | passa pelos 6 temas e volta ao inicial, com o aviso do nome |
| T07 | Trocar de tema com banda tocando (demo ou eventos reais) | nenhum músico some, a conexão continua "ao vivo", sem erro no console |
| T08 | Menu só pelo teclado | abre, navega com setas, escolhe com `Enter`, fecha com `Esc` |
| T09 | Synthwave | chão em grade, não em tábuas |
| T10 | Página publicada / arquivo aberto (sem servidor) | menu e atalho funcionam no modo demo |
| T11 | `docs/temas-de-cor.json` × `THEMES` no código | mesmos ids e mesmas cores (teste automatizado lendo os dois) |

**Pronto quando:** T01 a T11 passam (T01 a T10 com Playwright ou checagem manual com screenshot de cada tema; T11 em `node:test`), a legenda (`H`) e o README citam a feature, e o `docs/demo.gif` pode ser regravado com `?theme=`.

## Prompts do Spec Kit

Rode em ordem, no Claude Code, na pasta do projeto:

```text
/speckit.specify Implementar o seletor de tema de cor do palco descrito em docs/prd-temas-de-cor.md, usando docs/temas-de-cor.json como fonte da verdade das cores. Siga os requisitos RF01 a RF09, os não funcionais e o "Fora de escopo" do PRD. O que não estiver claro vira pergunta, não suposição.
```

```text
/speckit.clarify
```

```text
/speckit.plan Mudança concentrada em public/index.html, sem dependências e sem arquivos estáticos novos. Troque os literais de cor do cenário pelas chaves do tema seguindo a tabela "Mapeamento para o código atual" do PRD. Torne drawBG() e drawSign() reexecutáveis e crie applyTheme(id), que redesenha bg e sign sem tocar em sessions, members, particles nem na conexão SSE. Menu acessível no #ctrl, atalho C, persistência com o store existente e ?theme= na URL. Testes: node:test para o T11 (comparar THEMES com o JSON) e um script Playwright opcional que tira screenshot de cada tema com ?demo&theme=<id>.
```

```text
/speckit.tasks
```

```text
/speckit.analyze
```

```text
/speckit.implement Comece garantindo o T01 (tema neon idêntico à v1.2) antes de adicionar os outros temas. Depois implemente o menu, o atalho e a persistência. Ao final, rode os testes e me mostre um screenshot de cada um dos 6 temas.
```
