# Feature Specification: Palco Remoto (v1.2)

**Feature Branch**: `001-palco-remoto`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Implementar o \"Palco Remoto\" (v1.2) descrito em docs/prd-palco-remoto.md.
Use o PRD como fonte da verdade: cenários C1 a C4, requisitos RF01 a RF15 e RS01 a RS08, e os
épicos E1 a E4 como histórias de usuário priorizadas (E1 é P1 e bloqueia os demais). Não invente
requisitos fora do PRD; o que não estiver claro vira pergunta."

**Fonte da verdade**: [`docs/prd-palco-remoto.md`](../../docs/prd-palco-remoto.md). Cada requisito
abaixo cita o ID do PRD de onde vem (RFxx, RSxx, Txx). Como o produto é uma ferramenta de linha de
comando para desenvolvedores, nomes de variáveis, opções e rotas fazem parte da interface com o
usuário e aparecem na spec do mesmo jeito que no PRD.

## Clarifications

### Session 2026-11-07

- Q: O palco deve continuar aceitando `NIRVA_INSECURE=1` para subir exposto na rede sem token? →
  A: Sim, com aviso em português ao iniciar; os Princípios IV e V da constituição foram emendados
  (v1.1.0) para admitir essa exceção explícita.
- Q: Que status usar na recusa de `POST /event` com `Origin` de navegador estranho? → A: `401`
  sempre, com ou sem token; a troca do `403` da v1.1 é uma correção registrada como exceção ao
  Princípio V.
- Q: As mudanças da v1.2 que não dependem do token valem sempre ou só com `NIRVA_TOKEN`? →
  A: `host` no hook, `?host=` no servidor e rótulos `projeto @máquina` valem sempre; o limite de
  300 POSTs/10 s só vale com `NIRVA_TOKEN` definido.

## User Scenarios & Testing *(mandatory)*

Persona: dev ou líder técnico que usa o Claude Code em mais de uma máquina e quer um único painel
lúdico dos seus agentes.

Cenários de origem (PRD, "Personas e cenários"):

| Cenário | Máquina de origem | Hooks | Como envia | Como chega ao palco |
| --- | --- | --- | --- | --- |
| C1. Casa + notebook | PC pessoal | permitidos | hook de comando com URL e token | Tailscale Serve |
| C2. Estação corporativa | Windows da empresa | bloqueados (managed hooks only) | relay lendo os transcripts | Tailscale ou Cloudflare Tunnel |
| C3. Máquina sem Node | qualquer | permitidos | hook HTTP do Claude Code | Tailscale ou Cloudflare Tunnel |
| C4. Servidor ou VM de build | Linux headless | permitidos ou não | relay em Docker | Cloudflare Tunnel |

### User Story 1 - Autenticação do palco (Priority: P1) — Épico E1

Como dono do palco, quero exigir um token para que ninguém na rede envie ou veja eventos, digitar
esse token uma única vez no navegador e ter a garantia de que o palco não sobe exposto sem proteção.

**Why this priority**: sem autenticação nada pode ser exposto à rede; E1 bloqueia E2, E3 e E4.

**Independent Test**: subir o palco com `NIRVA_TOKEN` e verificar, só com requisições HTTP, que
rotas sem token são recusadas, que o login grava o cookie e que o palco recusa subir exposto sem
token (T01 a T05 e T08).

**Acceptance Scenarios**:

1. **Given** `NIRVA_HOST=0.0.0.0` sem `NIRVA_TOKEN`, `NIRVA_IN_DOCKER` ou `NIRVA_INSECURE`,
   **When** o palco inicia, **Then** o processo encerra com uma mensagem clara em português (RS01, T01).
2. **Given** `NIRVA_TOKEN` definido, **When** chegam `GET /`, `GET /events`, `POST /event` e
   `GET /vendor/qrcode.js` sem token, **Then** `/` mostra a página de login com `200` e os outros
   três respondem `401` (RF01, RF04, T02).
3. **Given** `NIRVA_TOKEN` definido, **When** `POST /event` chega com token errado, **Then** a
   resposta é `401`, nunca `403` (RS04, T03).
4. **Given** `NIRVA_TOKEN` definido, **When** o navegador abre `/?token=<certo>`, **Then** recebe
   `302` para a URL sem o token e um cookie `nirva_token` `HttpOnly; SameSite=Lax; Max-Age=30d`,
   com `Secure` atrás de HTTPS (RF03, RS07, T04).
5. **Given** o cookie gravado, **When** o navegador pede `/events` e arquivos estáticos,
   **Then** recebe `200` (RF02, T05).
6. **Given** `NIRVA_TOKEN` definido, **When** um mesmo IP faz 320 POSTs em menos de 10 s,
   **Then** 300 recebem `200` e 20 recebem `429` (RS05, T08).
7. **Given** qualquer máquina com o projeto, **When** o usuário roda `npm run token`, **Then**
   recebe um token aleatório de 192 bits com 32 caracteres base64url (RF05).
8. **Given** `NIRVA_TOKEN` definido, **When** chega uma requisição de 127.0.0.1 sem token,
   **Then** ela é recusada como qualquer outra (RS02).

---

### User Story 2 - Envio remoto pelos hooks (Priority: P2) — Épico E2

Como usuário com hooks permitidos (C1 e C3), quero apontar os hooks para um palco remoto, com ou
sem Node na máquina, e ver de qual máquina vem cada evento.

**Why this priority**: é o caminho mais simples e de menor latência para levar eventos ao palco
remoto; depende de E1.

**Independent Test**: com um palco protegido por token, enviar eventos pelo hook de comando e por
um hook HTTP simulado e verificar que chegam com o `host` correto (T06, T07).

**Acceptance Scenarios**:

1. **Given** um palco remoto com token, **When** o hook de comando roda com URL e token (por
   opção ou variável de ambiente, HTTP ou HTTPS), **Then** o evento chega com o nome da máquina de
   origem em `host` (RF06, T06).
2. **Given** o palco fora do ar ou inacessível, **When** o hook de comando roda, **Then** ele sai
   com código 0 em até 1,5 s (E2 2.1, não funcional "Desempenho").
3. **Given** o instalador com URL e token, **When** instala hooks de comando, **Then** os hooks
   recebem a URL e o token como argumentos; **When** instala hooks HTTP, **Then** `src`, `host` e
   `token` vão na query; em ambos os casos a saída do instalador mostra o token mascarado
   (RF07, RS07).
4. **Given** hooks já instalados, **When** o usuário reinstala com outros valores, **Then** as
   entradas antigas são substituídas, sem duplicar (E2 2.2).
5. **Given** um hook HTTP com `?token=<certo>&host=<máquina>`, **When** o evento não traz `host`,
   **Then** o palco responde `200` e grava o `host` da query no evento (RF08, T07).

---

### User Story 3 - Relay para máquinas com hooks bloqueados (Priority: P3) — Épico E3

Como usuário numa estação corporativa com managed hooks (C2) ou num servidor headless (C4), quero
que um repetidor leia os transcripts locais e envie os eventos ao palco remoto, sem que nenhum
conteúdo sensível saia da máquina.

**Why this priority**: cobre os cenários em que os hooks não funcionam; depende de E1 e do modo
transcript da v1.1.

**Independent Test**: rodar o relay sobre transcripts simulados contra um palco de teste e
verificar ordem, `host`, tipo de subagente, ausência de conteúdo sensível e reação a `401`
(T09, T10, T11).

**Acceptance Scenarios**:

1. **Given** transcripts simulados com prompt, leitura de arquivo, subagente Explore, comando com
   falha e fim de turno, **When** o relay roda, **Then** o palco recebe os 13 eventos esperados na
   ordem, todos com `host` e o subagente com o tipo correto (RF09, T09).
2. **Given** o relay em execução, **When** o fluxo de eventos do palco é inspecionado, **Then**
   não há texto de prompt, conteúdo de arquivo lido nem argumentos de comando (ex.: `--token=XYZ`)
   (RS06, T10).
3. **Given** o palco fora do ar, **When** o relay gera eventos, **Then** guarda até 1.000 na fila e
   tenta reenviar a cada 2 s (RF09, RF10).
4. **Given** um token errado, **When** o relay envia, **Then** mostra "O palco recusou o token
   (401)", descarta a fila e para (RF10, T11).
5. **Given** um destino HTTP fora do localhost, **When** o relay inicia, **Then** avisa que o
   tráfego não é cifrado (RF10).
6. **Given** um palco em modo transcript na mesma máquina, **When** chegam eventos de hooks locais
   (`src=nirva-stage`) e do relay (`src=nirva-relay`), **Then** os de hooks locais são ignorados e
   os do relay são exibidos (RF15).
7. **Given** Docker na origem, **When** o relay roda em contêiner com o diretório de transcripts
   montado como somente leitura e o nome da máquina informado, **Then** os eventos chegam ao palco
   com esse nome (RF13).

---

### User Story 4 - Palco multi-máquina e operação (Priority: P4) — Épico E4

Como dono do palco, quero distinguir de qual máquina vem cada sessão, subir o palco remoto com
segurança via Docker, diagnosticar problemas de token e ter documentação para configurar túneis e
o relay.

**Why this priority**: completa a experiência multi-máquina e a operação; depende de E1 a E3.

**Independent Test**: enviar sessões de duas máquinas e verificar os rótulos; subir o compose
remoto sem token e verificar a falha; rodar o doctor contra um palco com token (T12, T13).

**Acceptance Scenarios**:

1. **Given** sessões de duas ou mais máquinas, **When** o palco as exibe, **Then** vocalista,
   chip, registro e notificação mostram `projeto @máquina`; **Given** uma máquina só, **Then**
   nada muda em relação à v1.1 (RF11, T12).
2. **Given** `docker-compose.remote.yml` sem `NIRVA_TOKEN`, **When** o usuário sobe o compose,
   **Then** ele falha com mensagem clara; com token, a porta fica publicada só em
   `127.0.0.1:4321` (RF12).
3. **Given** um palco que exige token, **When** o usuário roda `npm run doctor` com ou sem
   `NIRVA_TOKEN`, **Then** o doctor usa o token se houver e explica quando o palco pede token
   (RF14).
4. **Given** o README, **When** o usuário o consulta, **Then** encontra como usar Tailscale
   Serve, Cloudflare Tunnel e o relay, e um aviso de governança explícito de que nomes de projetos
   e de arquivos saem da máquina corporativa e de que o relay nunca é ligado por padrão (E4 4.4,
   C2).
5. **Given** `NIRVA_TOKEN` não definido, **When** o palco roda, **Then** o comportamento é
   idêntico ao da v1.1 (T13, constituição V).

---

### Edge Cases

- `GET /?token=<errado>`: mostra a página de login de novo, sem gravar cookie e sem o token na URL
  final (RF04, RS07).
- Cookie expirado ou de um token antigo (após trocar o token): tratado como sem token.
- Token enviado ao mesmo tempo no cabeçalho, na query e no cookie com valores diferentes: basta um
  valor válido (RF02).
- Corpo do evento inválido ou truncado com token válido: o palco responde `200 {}` e descarta o
  evento, como na v1.1.
- `/health` sem token com a autenticação ligada: só `{ok, auth:"required"}`, sem contagens nem
  detalhes (RF01).
- `host` maior que 32 caracteres ou com caracteres de controle: o palco corta e limpa (Arquitetura,
  "Evento normalizado").
- Evento traz `host` e a query também: vale o do evento (RF08).
- Relay com a fila cheia (1.000) e o palco ainda fora do ar: os eventos mais antigos são
  descartados primeiro (assumido; ver Assumptions).
- Proxy corporativo bloqueia o túnel: fora do escopo do produto; o README documenta a alternativa
  de palco local (PRD, "Riscos").

## Requirements *(mandatory)*

### Functional Requirements

**E1 — Autenticação**

- **FR-001** (RF01): Com `NIRVA_TOKEN` definido, o palco MUST exigir o token em `POST /event`,
  `GET /events`, `GET /` e em todos os arquivos estáticos; `/health` sem token MUST responder só
  `{ok, auth:"required"}`, e com token MUST responder os detalhes.
- **FR-002** (RF02): O token MUST ser aceito no cabeçalho `Authorization: Bearer`, no parâmetro
  `?token=` ou no cookie `nirva_token`.
- **FR-003** (RF03): `GET /?token=<certo>` MUST gravar o cookie `nirva_token` com `HttpOnly`,
  `SameSite=Lax` e `Max-Age` de 30 dias, mais `Secure` quando a requisição chegar por HTTPS, e
  responder `302` para a mesma URL sem o token.
- **FR-004** (RF04): Sem token válido, `GET /` MUST mostrar uma página de login mínima em
  português; as demais rotas protegidas MUST responder `401`.
- **FR-005** (RF05): `npm run token` MUST imprimir um token aleatório de 192 bits codificado em
  base64url (32 caracteres).
- **FR-006** (RS01): O palco MUST se recusar a iniciar com `NIRVA_HOST` fora do loopback e sem
  `NIRVA_TOKEN`, exceto com `NIRVA_IN_DOCKER=1` ou `NIRVA_INSECURE=1`; com `NIRVA_INSECURE=1`, MUST
  mostrar ao iniciar um aviso em português de que o palco está exposto sem token.
- **FR-007** (RS01, constituição V): A imagem Docker oficial MUST declarar `NIRVA_IN_DOCKER=1`,
  para que quem já usa a imagem e o `docker-compose.yml` da v1.1 sem token continue funcionando.
- **FR-008** (RS02): A exigência de token MUST valer também para requisições vindas de 127.0.0.1.
- **FR-009** (RS03): A comparação do token MUST ser feita em tempo constante, sobre os resumos
  SHA-256 do valor recebido e do esperado.
- **FR-010** (RS04, constituição III): A recusa de autenticação em `/event` MUST responder `401`,
  nunca `403`.
- **FR-011** (RS05): Com `NIRVA_TOKEN` definido, o palco MUST aceitar no máximo 300 POSTs por IP a
  cada 10 s e responder `429` aos excedentes.
- **FR-012** (RS07): O token MUST NOT aparecer em logs, na saída do instalador nem na URL do
  navegador depois do login.
- **FR-013** (RS08, constituição III): Em `POST /event`, requisições com cabeçalho `Origin` cujo
  host não seja loopback (nem, com `NIRVA_TOKEN` definido, o próprio host da requisição) MUST ser
  recusadas com `401`, com ou sem
  `NIRVA_TOKEN` (substitui o `403` da v1.1). Requisições sem `Origin` (hooks, curl, relay) não são
  afetadas por esta regra.

**E2 — Envio remoto pelos hooks**

- **FR-014** (RF06): O hook de comando MUST aceitar a URL e o token por opção (`--url`,
  `--token`) ou por variável de ambiente (`NIRVA_URL`, `NIRVA_TOKEN`), suportar HTTP e HTTPS e
  anexar ao evento o nome da máquina (`host`).
- **FR-015** (não funcional "Desempenho", constituição III): O hook MUST sempre sair com código 0
  em até 1,5 s, inclusive com o palco fora do ar, lento ou recusando o token.
- **FR-016** (RF07): O instalador MUST aceitar `--url` e `--token` para hooks de comando e HTTP;
  nos hooks HTTP MUST gravar `src`, `host` e `token` na query; a saída MUST mascarar o token.
- **FR-017** (E2 2.2): Reinstalar hooks MUST substituir as entradas anteriores do Nirva Stage sem
  duplicá-las.
- **FR-018** (RF08): O palco MUST ler `?host=` no `POST /event` e gravá-lo no evento quando este
  não trouxer `host`.

**E3 — Relay**

- **FR-019** (RF09): `npm run relay -- --url --token [--dir] [--host]` MUST ler os transcripts
  locais do Claude Code e enviar ao palco remoto os eventos já normalizados, marcados com
  `src=nirva-relay`.
- **FR-020** (RF09, não funcional "Resiliência"): O relay MUST guardar até 1.000 eventos quando o
  palco estiver inacessível e tentar reenviar a cada 2 s.
- **FR-021** (RF10): Ao receber `401`, o relay MUST mostrar "O palco recusou o token (401)",
  descartar a fila e parar; com destino HTTP fora do localhost, MUST avisar ao iniciar.
- **FR-022** (RS06, constituição II): Só o resumo do evento MAY sair da máquina de origem
  (ferramenta, nome do arquivo sem caminho, primeira palavra do comando, host da URL, mais projeto,
  máquina e identificadores de sessão e agente); conteúdo, prompts, saídas e argumentos MUST NOT
  sair, em nenhum dos caminhos (hook de comando, hook HTTP, relay).
- **FR-023** (RF13): O relay MUST poder rodar em Docker com o diretório de transcripts montado
  como somente leitura e o nome da máquina informado por opção.
- **FR-024** (RF15): No modo transcript, o palco MUST ignorar eventos de hooks locais
  (`src=nirva-stage`) e MUST exibir os do relay (`src=nirva-relay`).
- **FR-025** (E3 3.1, Riscos): O relay MUST NOT ser ligado por padrão em nenhuma instalação.

**E4 — Palco multi-máquina e operação**

- **FR-026** (RF11): Quando houver sessões de mais de uma máquina, rótulos do vocalista, chips,
  registro e notificações MUST mostrar `projeto @máquina`; com uma máquina só, MUST permanecer como
  na v1.1.
- **FR-027** (RF12): `docker-compose.remote.yml` MUST falhar sem `NIRVA_TOKEN` e MUST publicar a
  porta só em `127.0.0.1`.
- **FR-028** (RF14): `npm run doctor` MUST usar `NIRVA_TOKEN` quando definido e avisar, em
  português, quando o palco exigir token.
- **FR-029** (E4 4.4, C2): O README MUST documentar Tailscale Serve, Cloudflare Tunnel e o relay,
  com aviso de governança explícito de que nomes de projetos e de arquivos saem da máquina de
  origem.

**Transversais**

- **FR-030** (não funcional "Compatibilidade", constituição V, T13): Sem `NIRVA_TOKEN`, o
  comportamento observável MUST ser idêntico ao da v1.1, no Windows, macOS e Linux com Node 18+,
  com três exceções aditivas e uma correção: o hook envia `host`, o palco lê `?host=`, os rótulos
  mostram `@máquina` quando há mais de uma máquina, e a recusa por `Origin` passa de `403` para
  `401` (FR-013). O limite de taxa (FR-011) só vale com `NIRVA_TOKEN` definido.
- **FR-031** (não funcional "Dependências", constituição I): A v1.2 MUST NOT adicionar
  dependências npm.
- **FR-032** (constituição VII): Mensagens ao usuário (terminal, página de login, avisos do relay
  e do doctor) MUST estar em português.

### Key Entities *(include if feature involves data)*

- **Evento normalizado (v1)**: resumo de uma ação do Claude Code: versão, tipo de evento, sessão,
  agente, tipo de agente, ferramenta, detalhe resumido, projeto, nota, tipo de nota, máquina
  (`host`, novo, até 32 caracteres) e instante (sempre definido pelo palco).
- **Token do palco**: segredo único por palco que liga a autenticação; um token por palco (PRD,
  não-objetivos).
- **Sessão do navegador**: cookie `nirva_token` com validade de 30 dias.
- **Máquina de origem**: identificada pelo `host`; define o sufixo `@máquina` nos rótulos.
- **Fila do relay**: até 1.000 eventos pendentes em memória, na máquina de origem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma ação do Claude Code aparece no palco remoto em até 1 s via hook e em até 2 s via
  relay, em rede normal (PRD, "Métricas").
- **SC-002**: Zero ocorrências de conteúdo sensível (texto de prompt, conteúdo de arquivo,
  argumentos de comando) no fluxo de eventos do palco em toda versão publicada (T10).
- **SC-003**: Zero acessos aceitos sem token válido nos testes de autenticação (T02, T03).
- **SC-004**: O hook nunca atrasa o Claude Code em mais de 1,5 s e sempre termina com sucesso, em
  100% das execuções com o palco fora do ar.
- **SC-005**: Duas ou mais máquinas no mesmo palco por pelo menos uma semana de uso real, sem
  eventos perdidos visíveis (PRD, "Métricas").
- **SC-006**: Um vocalista da estação corporativa aparece no palco de casa em menos de 2 s no
  teste manual com Windows real, Tailscale Serve e relay (T14).
- **SC-007**: Todos os testes de T01 a T13 passam em CI (Ubuntu, Node 22) e todo requisito desta
  spec tem ao menos um teste automatizado (constituição VI).

## Assumptions

- O repositório não tem suíte de testes da v1.1 (o CI só faz checagem de sintaxe e um teste de
  fumaça). Para cumprir o T13 e o Princípio V, testes de caracterização do comportamento da v1.1
  precisam ser escritos antes de qualquer mudança.
- O histórico continua em memória (500 eventos, 2 h) e não há contas de usuário: um token por
  palco basta (PRD, não-objetivos). A questão em aberto do PRD sobre um token por máquina fica para
  depois da v1.2.
- O token dos hooks HTTP vai na query (RF07). A questão em aberto do PRD sobre cabeçalho com
  variável de ambiente não muda esta versão.
- Fila do relay cheia: descartar primeiro os eventos mais antigos (o PRD fixa o limite, mas não a
  política).
- Sessões do Claude Code na nuvem, detecção de pedido de permissão no relay e serviço hospedado
  ficam fora do escopo (PRD, não-objetivos).
- A aprovação do relay pela política de segurança corporativa (questão em aberto do PRD) é
  organizacional e não bloqueia a implementação; o relay vem desligado por padrão.
- Dependências externas: Node 18+ ou Docker na origem; Tailscale ou cloudflared na máquina do
  palco; modo transcript da v1.1.
- A publicação da imagem `1.2.0` e a tag `v1.2.0` fazem parte da definição de pronto do PRD, mas
  são etapas de release, não requisitos funcionais.
