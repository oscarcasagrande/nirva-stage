# Feature Specification: Temas de cor do palco (v1.3)

**Feature Branch**: `spec-kit-setup`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Implementar o seletor de tema de cor do palco descrito em
docs/prd-temas-de-cor.md, usando docs/temas-de-cor.json como fonte da verdade das cores. Siga os
requisitos RF01 a RF09, os não funcionais e o \"Fora de escopo\" do PRD. O que não estiver claro
vira pergunta, não suposição."

**Fonte da verdade**: [`docs/prd-temas-de-cor.md`](../../docs/prd-temas-de-cor.md) para o
comportamento e [`docs/temas-de-cor.json`](../../docs/temas-de-cor.json) para as cores. Cada
requisito cita o ID do PRD (RFxx, Txx).

## Clarifications

### Session 2026-11-07

Respondidas de forma autônoma (pedido do dono), sempre pela opção recomendada ou pela mais
coerente com o PRD, a constituição e o código atual.

- Q: As luzes giratórias (feixes de energia alta) acompanham as cores de lavagem do tema? → A:
  Sim, usam `washA` (esquerda) e `washB` (direita). Motivo: hoje usam exatamente os mesmos valores
  RGB da lavagem; no Neon o resultado fica idêntico e nos outros temas não sobra rosa/ciano fora
  da paleta.
- Q: Com `?theme=` na URL, uma escolha explícita depois (menu ou `C`) é salva? → A: Sim. Só o
  tema forçado pela URL ao abrir não é gravado; escolha explícita do usuário sempre é. Motivo: o
  RF07 restringe apenas o efeito da URL, e o RF06 manda lembrar a escolha do usuário.
- Q: Qual o espaçamento da grade do chão em grade (Synthwave)? → A: Linhas horizontais a cada
  12 px e verticais a cada 20 px (resolução lógica 640×360), em `floorLine` sobre `floorA`, sem
  perspectiva. Motivo: células próximas de quadradas e legíveis em pixel art, mesmo custo de
  desenho das tábuas.
- Q: Literais vizinhos que não estão em `keys` mas têm o mesmo valor de uma chave (sombra das
  prateleiras `#120c1f`, moldura externa do letreiro `#0c0816`) seguem o tema? → A: Sim: a sombra
  da prateleira usa `brick` e a moldura do letreiro usa `baseboard`. Motivo: fazem parte da
  prateleira e do letreiro (RF03/RF04), têm hoje o mesmo valor dessas chaves (Neon idêntico) e
  evitam um contorno roxo em temas como Terminal hacker. Os demais literais do cenário fora de
  `keys` (pôsteres, amplificadores, microfones, holofotes) ficam como estão (fora de escopo).
- Q: Onde e com que texto aparece o aviso da tecla `C`? → A: Painel `.panel` centralizado na
  base da tela (entre o banner do demo e o registro), com o texto "🎨 <nome do tema>", por 1,5 s;
  se `C` for apertado de novo antes, o aviso é reiniciado. Motivo: segue o padrão visual dos
  painéis e não cobre o letreiro nem o registro. (Ajuste feito na implementação: a primeira
  escolha, no topo abaixo dos chips, cobria o letreiro "NIRVA ROCK" no screenshot.)

## User Scenarios & Testing *(mandatory)*

Persona: quem deixa o palco aberto numa tela (dev, streamer, time) e quer combinar o visual com o
ambiente, a gravação ou o gosto pessoal.

### User Story 1 - Palco igual ao de hoje no tema padrão (Priority: P1)

Como usuário atual, quero abrir o palco depois da atualização e vê-lo exatamente como antes, sem
precisar escolher nada.

**Why this priority**: é a garantia de que a feature não quebra nada; todas as outras dependem de
as cores do cenário passarem a vir de um tema sem mudar o visual atual.

**Independent Test**: abrir o palco sem tema salvo e comparar com a v1.2 pixel a pixel (T01).

**Acceptance Scenarios**:

1. **Given** um navegador sem tema salvo, **When** o palco abre, **Then** o tema ativo é Neon
   noturno e o cenário é idêntico ao da v1.2 (T01).
2. **Given** o tema Neon noturno, **When** a banda toca, **Then** personagens, instrumentos,
   pôsteres, amplificadores, HUD e cores de atividade e de sessão são os de hoje.

---

### User Story 2 - Escolher um tema no menu (Priority: P2)

Como usuário, quero clicar em 🎨, ver os 6 temas com uma miniatura e escolher um, e o palco
muda na hora sem perder a banda.

**Why this priority**: é o valor principal da feature.

**Independent Test**: escolher cada tema no menu e verificar a mudança do cenário com a banda
intacta (T02, T07, T09).

**Acceptance Scenarios**:

1. **Given** o palco aberto, **When** o usuário clica em 🎨 (antes do 🔇, title "Tema do palco
   (C)"), **Then** abre um painel com uma linha por tema: miniatura 64×36 (parede, letreiro com as
   duas cores e chão), nome, tagline e ✓ no tema ativo.
2. **Given** o menu aberto, **When** o usuário escolhe um tema, **Then** parede, letreiro, luzes
   de fundo, LEDs, chão, plateia, escurecimento e fundo da página mudam para as cores do tema, e o
   menu fecha (RF02–RF04, T02).
3. **Given** a banda tocando (demo ou eventos reais), **When** o tema muda, **Then** nenhum
   músico some, as partículas continuam, a conexão continua "ao vivo" e não há erro no console
   (RF09, T07).
4. **Given** o tema Synthwave, **When** o palco é desenhado, **Then** o chão é uma grade, não
   tábuas (RF05, T09).
5. **Given** o menu aberto, **When** o usuário aperta `Esc` ou clica fora, **Then** o menu fecha
   sem mudar o tema.

---

### User Story 3 - Atalho, persistência e URL (Priority: P3)

Como usuário, quero trocar de tema pelo teclado, que a escolha seja lembrada e poder forçar um
tema pela URL para demos e gravações.

**Why this priority**: conveniência sobre a US2.

**Independent Test**: tecla `C`, recarga da página, `?theme=` válido e inválido (T03–T06).

**Acceptance Scenarios**:

1. **Given** um tema escolhido, **When** a página recarrega, **Then** o mesmo tema continua ativo
   (RF06, T03).
2. **Given** `?theme=hacker` na URL, **When** o palco abre, **Then** o tema é Terminal hacker e a
   escolha salva no navegador não muda (RF07, T04).
3. **Given** `?theme=xyz` ou um valor salvo corrompido, **When** o palco abre, **Then** o tema é
   Neon noturno, sem erro no console (RF06, T05).
4. **Given** o palco aberto, **When** o usuário aperta `C` seis vezes, **Then** passa pelos 6
   temas na ordem e volta ao inicial, e a cada troca aparece por 1,5 s um aviso discreto com o
   nome do tema (T06).
5. **Given** a legenda (`H`), **When** aberta, **Then** lista o atalho `C`.

---

### User Story 4 - Acessibilidade e modo sem servidor (Priority: P4)

Como usuário de teclado, ou abrindo a página publicada sem servidor, quero usar o menu e o atalho
do mesmo jeito.

**Why this priority**: completa a experiência; o núcleo vem das US1–US3.

**Independent Test**: operar o menu só pelo teclado e repetir T02/T06 no modo demo sem servidor
(T08, T10).

**Acceptance Scenarios**:

1. **Given** o foco no botão 🎨, **When** o usuário aperta `Enter`, usa as setas e `Enter` de
   novo, **Then** o menu abre, o destaque percorre os temas e o tema escolhido é aplicado; `Esc`
   fecha (T08).
2. **Given** o menu, **When** lido por leitor de tela, **Then** é um `menu` com itens
   `menuitemradio` e o ativo tem `aria-checked="true"`.
3. **Given** a página aberta como arquivo ou publicada (modo demo), **When** o usuário usa o menu
   e o `C`, **Then** funcionam como com servidor (RF08, T10).

---

### Edge Cases

- `localStorage` indisponível (modo privado, bloqueado): o tema funciona na sessão e cai em Neon
  noturno na próxima abertura, sem erro.
- Valor salvo que não é um id conhecido (ex.: tema removido numa versão futura): cai em Neon
  noturno.
- `?theme=` vazio: igual a não ter o parâmetro.
- Tecla `C` com Ctrl/Cmd/Alt (ex.: Ctrl+C para copiar): não troca o tema.
- Escolher o tema que já está ativo: fecha o menu sem redesenho visível.
- Menu aberto e janela redimensionada: o menu continua ancorado no botão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (RF01): O palco MUST oferecer exatamente os 6 temas de `docs/temas-de-cor.json`, com
  os mesmos ids, nomes, taglines e cores, na mesma ordem.
- **FR-002** (RF02): Toda cor do cenário listada em `keys` do JSON MUST vir do tema ativo; nenhum
  desses literais pode continuar fixo no desenho do cenário.
- **FR-003** (RF03): Trocar de tema MUST redesenhar o fundo do cenário e o letreiro.
- **FR-004** (RF04): Luzes de fundo, LEDs, plateia, escurecimento do ambiente, fundo da página e
  prateleiras MUST usar o tema ativo.
- **FR-005** (RF05): Em tema com chão em grade (Synthwave), o chão MUST ser desenhado como grade
  de linhas horizontais e verticais na cor de junta sobre a cor de base do chão.
- **FR-006** (RF06): A escolha MUST ser lembrada por navegador; id inválido, ausente ou
  armazenamento indisponível MUST resultar em Neon noturno, sem erro.
- **FR-007** (RF07): `?theme=<id>` MUST forçar o tema ao abrir, sem alterar a escolha salva.
- **FR-008** (RF08): Menu e atalho MUST funcionar no modo demo e na página sem servidor.
- **FR-009** (RF09): Trocar de tema MUST NOT reiniciar a conexão de eventos, nem remover sessões,
  músicos ou partículas.
- **FR-010** (Experiência): Botão 🎨 no grupo de controles, antes do 🔇, com o título "Tema do
  palco (C)"; menu com miniatura 64×36, nome, tagline e ✓ no ativo; fecha ao escolher, com `Esc`
  ou clique fora.
- **FR-011** (Experiência, acessibilidade): O menu MUST ser operável só pelo teclado (setas,
  `Enter`, `Esc`) e anunciar o tema ativo (`role="menu"`, `role="menuitemradio"`,
  `aria-checked`).
- **FR-012** (Experiência): A tecla `C` MUST avançar para o próximo tema, ciclando, e mostrar o
  nome do tema por 1,5 s num aviso com o visual dos painéis existentes.
- **FR-013** (Experiência): A legenda (`H`) e o README MUST citar o atalho `C` e o menu 🎨.
- **FR-014** (T11): Um teste automatizado MUST verificar que os temas do código são iguais aos do
  JSON (ids, nomes, taglines e todas as cores).
- **FR-015** (Fora de escopo, constituição I): Cores de atividade e de sessão, personagens,
  instrumentos, pôsteres, amplificadores e HUD MUST NOT mudar; sem dependências npm novas e sem
  arquivos estáticos novos servidos pelo palco.
- **FR-016** (clarificação): As luzes giratórias de energia alta MUST usar `washA` (esquerda) e
  `washB` (direita).
- **FR-017** (clarificação): Escolha explícita do usuário (menu ou `C`) MUST ser salva mesmo
  quando a página foi aberta com `?theme=`; só o tema forçado pela URL ao abrir não é gravado.
- **FR-018** (clarificação): O chão em grade MUST ter linhas horizontais a cada 12 px e verticais
  a cada 20 px (resolução lógica 640×360), sem perspectiva.
- **FR-019** (clarificação): A sombra das prateleiras MUST usar `brick` e a moldura externa do
  letreiro MUST usar `baseboard`; os demais literais fora de `keys` não mudam.
- **FR-020** (clarificação): O aviso da tecla `C` MUST aparecer centralizado na base da tela, com
  o texto "🎨 <nome do tema>", por 1,5 s, reiniciando se `C` for apertado de novo, sem cobrir o
  letreiro nem o registro.

### Key Entities

- **Tema**: id, nome, tagline, ~36 cores do cenário (chaves de `keys` do JSON) e, opcionalmente,
  `floorGrid`.
- **Escolha de tema**: id salvo por navegador (`nirva:theme`); pode ser sobreposto pela URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o tema padrão, o quadro do palco é 100% idêntico ao da v1.2 (comparação pixel a
  pixel de um quadro de referência) (T01).
- **SC-002**: A troca de tema aparece na tela em menos de 50 ms.
- **SC-003**: Em 100% das trocas, o número de músicos e sessões no palco é o mesmo antes e depois,
  e a conexão continua ativa (T07).
- **SC-004**: O usuário troca de tema em no máximo 2 ações (clique no 🎨 + clique no tema, ou uma
  tecla).
- **SC-005**: Zero erros no console ao abrir com cada um dos 6 temas, com `?theme=` inválido e com
  armazenamento corrompido (T05).
- **SC-006**: T01 a T11 passam (T11 automatizado; T01–T10 por automação de navegador com
  screenshot de cada tema).

## Assumptions

- O texto do HUD (painéis, chips, rótulos) não muda de cor com o tema: o contraste continua o de
  hoje (PRD, acessibilidade).
- O aviso da troca reaproveita o estilo `.panel`; é um elemento da própria página, não um arquivo
  novo.
- A miniatura de cada tema é desenhada na própria página a partir das cores do tema.
- A automação de navegador usada para screenshots é ferramenta de desenvolvimento, fora do
  `package.json` (constituição I).
- O servidor de validação pode rodar em outra porta quando a 4321 estiver ocupada.
