---

description: "Lista de tarefas do Palco Remoto (v1.2)"
---

# Tasks: Palco Remoto (v1.2)

**Input**: Design documents from `specs/001-palco-remoto/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/http.md](contracts/http.md),
[contracts/cli.md](contracts/cli.md), [quickstart.md](quickstart.md)

**Tests**: obrigatórios (constituição VI e pedido do usuário). Em cada história, os testes vêm
primeiro e MUST falhar antes da implementação. Todos usam `node:test` + `node:assert/strict`, sem
dependências, e rodam com `npm test`.

**Organization**: tarefas agrupadas por história (US1 = E1 … US4 = E4). O campo `host` do evento,
que serve US2, US3 e US4, fica na fase Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: história da spec (US1 a US4)
- `server.js` é um arquivo só: tarefas nele nunca são [P] entre si

## Path Conventions

Estrutura plana atual: `server.js`, `hook.js`, `install-hooks.js` na raiz; `lib/`, `scripts/`,
`public/`; testes em `test/` (ver [plan.md › Project Structure](plan.md#project-structure)).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: infraestrutura de teste e scripts

- [X] T001 (`test` usa `node test/run.js`, porque `node --test` sem argumentos executaria `scripts/send-test.js`) Em `package.json`, acrescentar os scripts `"test": "node --test"`, `"token": "node scripts/token.js"` e `"relay": "node scripts/relay.js"`, sem criar `dependencies` nem `devDependencies` (versão continua `1.1.0` até a T045)
- [X] T002 [P] Criar `test/helpers.js` com: `freePort()` (via `net.createServer().listen(0)`); `startServer({ env, args })` que faz `spawn(process.execPath, ['server.js', ...args])` com `NIRVA_PORT=<livre>`, `NIRVA_DOCKER=0` e o `env` dado, espera a linha "Nirva Stage no ar" no stdout (timeout 5 s) e devolve `{ port, base, proc, out(), stop() }`; `runNode(script, args, { env, stdin, timeoutMs })` que devolve `{ code, stdout, stderr, ms }`; `readSSE(url, { headers, untilCount, timeoutMs })` com `http.get` e parser de `event:`/`data:` que devolve `{ events: [{event, data}], raw }`; e `fetchNoRedirect(url, opts)` = `fetch` com `redirect: 'manual'`
- [X] T003 [P] Criar a fixture do T09 em `test/fixtures/transcripts/`: `main.jsonl` (sessão `fx-sessao`, `cwd` `/home/fx/projeto-fx`) com, em ordem: prompt do usuário com o texto `SEGREDO-PROMPT-123`; `tool_use` `Read` com `file_path` `/home/fx/secret/notas.md`; `tool_result` com conteúdo `CONTEUDO-SECRETO-456`; `tool_use` `Task` com `subagent_type` `Explore`; `tool_result` do `Task` (fim do subagente); `tool_use` `Bash` com `command` `deploy --token=XYZ`; `tool_result` com `is_error: true`; mensagem do assistente com `stop_reason: "end_turn"` e sem ferramenta. Criar `agent-fx1.jsonl` (subagente) com um `tool_use` `Grep` e seu `tool_result`. Criar `expected.json` com os 13 eventos esperados: SessionStart, UserPromptSubmit, PreToolUse Read, PostToolUse Read, PreToolUse Task, SubagentStart (Explore), PreToolUse Grep, PostToolUse Grep, PostToolUse Task, SubagentStop, PreToolUse Bash, PostToolUseFailure Bash, Stop. Documentar num comentário de `expected.json` que os arquivos são anexados em etapas pelo teste (ver T029)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: fixar o comportamento da v1.1 e criar o campo `host`, usado por US2 a US4

**⚠️ CRITICAL**: nenhuma história começa antes desta fase

- [X] T004 Criar `test/v11-compat.test.js` (T13) contra o código **atual**, sem `NIRVA_TOKEN`: `GET /health` → `200` com `ok`, `clients`, `events`, `docker`, `mode`; `GET /` e `/index.html` → `200` HTML; `GET /vendor/qrcode.js` → `200`; `GET /nada` → `404`; `GET /events` → `200` `text/event-stream` com `retry: 2000` e eventos `mode` e `replay`; `POST /event` com payload válido, inválido e vazio → sempre `200` e corpo `{}`; evento enviado aparece no `replay` de uma nova conexão SSE; com `--transcripts` e `NIRVA_TRANSCRIPTS` numa pasta temporária vazia, `POST /event?src=nirva-stage` não aparece no `replay`; `echo '{...}' | node hook.js` com o palco desligado sai com código 0. Rodar e confirmar que **passa** antes de qualquer mudança. Não incluir o caso `Origin` (muda para `401`, coberto na T010)
- [X] T005 [P] Criar `test/normalize.test.js`: `normalize(raw, { host: 'maq' })` devolve `host: 'maq'`; sem opção devolve `host: ''`; `host` com 40 caracteres é cortado para "até 32 caracteres"; `sanitize({ ...evento, host: 'x'.repeat(40) })` devolve `host` com até 32; `sanitize` sem `host` devolve `''`; os outros campos e limites (`session` 64, `detail` 40, `project` 40…) continuam iguais
- [X] T006 Em `lib/normalize.js`, acrescentar o campo `host` (texto, "até 32 caracteres", via `clip`) em `normalize(raw, opts = {})` (de `opts.host`) e em `sanitize(ev)` (de `ev.host`), sem mudar mais nada; T004 e T005 MUST passar
- [X] T007 Em `.github/workflows/docker-publish.yml`, job `check`: acrescentar o passo "Testes" (`npm test`) depois de "Sintaxe" e antes do teste de fumaça

**Checkpoint**: `npm test` verde no CI; comportamento da v1.1 fixado

---

## Phase 3: User Story 1 - Autenticação do palco (Priority: P1) 🎯 MVP

**Goal**: com `NIRVA_TOKEN`, nada entra nem sai do palco sem token; login no navegador com
cookie; o palco não sobe exposto sem proteção.

**Independent Test**: T01 a T05 e T08 só com requisições HTTP contra `server.js`
(ver [contracts/http.md](contracts/http.md)).

### Tests for User Story 1 ⚠️

> Escrever primeiro e ver falhar.

- [X] T008 [P] [US1] Criar `test/exposure.test.js` (T01, RS01) cobrindo a tabela "Inicialização" de `contracts/http.md` com `NIRVA_HOST=0.0.0.0`: sem token e sem exceções → processo sai com código 1 em até 3 s e o stderr menciona `NIRVA_TOKEN` e `npm run token`; com `NIRVA_TOKEN` → inicia; com `NIRVA_IN_DOCKER=1` → inicia; com `NIRVA_INSECURE=1` → inicia e o stdout tem o aviso de exposição sem token; com `NIRVA_HOST=127.0.0.1` sem token → inicia
- [X] T009 [P] [US1] Criar `test/token.test.js` (RF05): `node scripts/token.js` sai com 0 e imprime uma linha que casa `/^[A-Za-z0-9_-]{32}$/`; duas execuções dão valores diferentes
- [X] T010 [P] [US1] Criar `test/auth.test.js` com o palco em `NIRVA_TOKEN=tok-teste-123`: (T02) sem token `GET /` → `200` com a página de login (contém "token" e não contém `vendor/qrcode.js`), `GET /events`, `POST /event` e `GET /vendor/qrcode.js` → `401`; (T03) `POST /event` com `Authorization: Bearer errado` → `401`; (FR-002) token certo aceito em `Authorization: Bearer`, em `?token=` e no cookie `nirva_token`; (T04) `GET /?token=<certo>` → `302`, `Location: /` e `Set-Cookie` com `nirva_token=`, `HttpOnly`, `SameSite=Lax`, `Max-Age=2592000`, `Path=/` e sem `Secure`; com `X-Forwarded-Proto: https` → inclui `Secure`; `GET /?demo&token=<certo>` → `Location: /?demo`; `GET /?token=errado` → `200`, contém "Token inválido" e sem `Set-Cookie`; (T05) com o cookie, `/events` e `/vendor/qrcode.js` → `200`; (FR-001) `/health` sem token → exatamente `{"ok":true,"auth":"required"}`, com token → detalhes + `auth`; (RS02) tudo acima vale para requisições de 127.0.0.1; (RS08/FR-013) `POST /event` com `Origin: https://malicioso.example` → `401` com e sem `NIRVA_TOKEN`, com `Origin` igual ao `Host` → `200`; (RS04) nenhuma resposta de `/event` é `403`; (RS07) o stdout/stderr do servidor nunca contém `tok-teste-123`; (RS03) `server.js` contém `timingSafeEqual` e `sha256`
- [X] T011 [P] [US1] Criar `test/rate-limit.test.js` (T08, RS05): com `NIRVA_TOKEN`, 320 `POST /event` autenticados do mesmo IP em menos de 10 s (concorrência 20) → exatamente 300 × `200` e 20 × `429`; sem `NIRVA_TOKEN`, 320 POSTs → todos `200` (clarificação)

### Implementation for User Story 1

- [X] T012 [P] [US1] Criar `scripts/token.js`: imprime `crypto.randomBytes(24).toString('base64url')` e sai com 0 (T009)
- [X] T013 [P] [US1] Em `Dockerfile`, acrescentar `NIRVA_IN_DOCKER=1` ao bloco `ENV` (FR-007), para a imagem e o `docker-compose.yml` da v1.1 continuarem subindo sem token
- [X] T014 [US1] Em `server.js`, antes de `server.listen`, implementar a guarda de exposição (R12): `NIRVA_HOST` fora de `127.0.0.1`/`::1`/`localhost` e sem `NIRVA_TOKEN` → com `NIRVA_IN_DOCKER=1` segue; com `NIRVA_INSECURE=1` segue e imprime aviso em português de que o palco está exposto sem token; senão imprime no stderr a mensagem da RS01 em português (citando `NIRVA_TOKEN` e `npm run token`) e `process.exit(1)` (T008)
- [X] T015 [US1] Em `server.js`, implementar a autenticação (R03): `TOKEN = process.env.NIRVA_TOKEN || ''`, `TOKEN_HASH = sha256(TOKEN)` ao iniciar, `tokenFrom(req, url)` lendo `Authorization: Bearer`, `?token=` e o cookie `nirva_token` (parser de `Cookie` nativo), `authed(req, url)` com `crypto.timingSafeEqual` sobre os SHA-256; com `TOKEN` definido: `/vendor/qrcode.js` e `/events` → `401` sem token; `/health` sem token → `{"ok":true,"auth":"required"}`, com token → detalhes da v1.1 + `auth: "required"`; sem `TOKEN`, tudo como na v1.1 (T004, T010)
- [X] T016 [US1] Em `server.js`, implementar login e cookie (R04, contrato "GET /?token="): com `TOKEN`, `GET /` ou `/index.html` sem token válido → `200` com página de login HTML inline em português (campo senha `token`, botão "Entrar", formulário `GET /`, aviso "Token inválido" quando veio `?token=` errado); com `?token=` certo → `302` para a URL sem o parâmetro `token` e `Set-Cookie: nirva_token=<t>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` + `; Secure` se `x-forwarded-proto` for `https` ou o socket for TLS (T010)
- [X] T017 [US1] Em `server.js`, trocar a recusa por `Origin` do `POST /event` (hoje `403` em `isLocalOrigin`, ~linha 164) por `401`, aceitando `Origin` cujo hostname seja loopback **ou** igual ao hostname do cabeçalho `Host`; depois aplicar a checagem de token (`401`); manter a ordem de `contracts/http.md` e o `200 {}` no resto (T010)
- [X] T018 [US1] Em `server.js`, implementar o limite de taxa (R06) só com `TOKEN`: `Map<remoteAddress, { inicio, contagem }>` com janela de 10 s, limpeza de entradas expiradas, verificação antes da autenticação em `POST /event`; acima de 300 → `429` com corpo `{}` (T011)
- [X] T019 [US1] Em `server.js`, na mensagem de início, mostrar "Autenticação: ligada (NIRVA_TOKEN)" ou "desligada" sem nunca imprimir o token; rodar `npm test` completo (T004, T008–T011 verdes)

**Checkpoint**: E1 completo; o palco pode ser exposto por túnel com segurança

---

## Phase 4: User Story 2 - Envio remoto pelos hooks (Priority: P2)

**Goal**: hooks de comando e HTTP enviam para um palco remoto com token e `host`.

**Independent Test**: T06 e T07 contra um palco local com token
(ver [contracts/cli.md](contracts/cli.md)).

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Criar `test/hook-remote.test.js` (T06, FR-014, FR-015): palco com `NIRVA_TOKEN`; `node hook.js --nirva-stage --url http://127.0.0.1:<porta>/event --token <t>` com payload `SessionStart` no stdin → código 0 e o evento aparece no `replay` com `host` igual a `os.hostname()` cortado em 32; mesma coisa com `NIRVA_URL`/`NIRVA_TOKEN` no ambiente; HTTPS: servidor `https` de teste com certificado autoassinado de `test/fixtures/tls/` (gerar uma vez com `openssl` e versionar) e `NODE_TLS_REJECT_UNAUTHORIZED=0` no ambiente do hook → recebe o POST com `Authorization: Bearer` e `src=nirva-stage`; palco desligado (porta livre sem servidor), token errado e destino que não responde (servidor TCP que aceita e não responde) → código 0 e tempo total ≤ 2.000 ms (1.500 ms da guarda + margem de boot do Node, anotada no teste); stdout vazio em todos os casos
- [X] T021 [P] [US2] Criar `test/install-hooks.test.js` (RF07, RS07, E2 2.2) com `--settings` num arquivo temporário: modo comando com `--url U --token abcdef123456` → cada entrada tem `node "<…>/hook.js" --nirva-stage --url U --token abcdef123456`; `--http` → a URL tem `src=nirva-stage`, `host=<os.hostname()>` e `token=abcdef123456`; o stdout não contém `abcdef123456` e contém `abcd…`; instalar duas vezes → exatamente uma entrada do Nirva Stage por evento; hooks de terceiros preservados; `--uninstall` remove só as do Nirva Stage
- [X] T022 [P] [US2] Criar `test/host-query.test.js` (T07, FR-018): `POST /event?src=nirva-stage&host=maquina-b&token=<t>` com payload bruto de hook → `200` e evento com `host: 'maquina-b'`; evento `v:1` com `host: 'propria'` e `?host=outra` → mantém `propria`; `?host=` com 40 caracteres → cortado em 32; sem `NIRVA_TOKEN`, `?host=` também vale (clarificação)

### Implementation for User Story 2

- [X] T023 [P] [US2] Em `hook.js` (R08): ler `--url`/`--token` de `process.argv` com fallback `NIRVA_URL`/`NIRVA_TOKEN` e padrão `http://127.0.0.1:${NIRVA_PORT||4321}/event`; escolher `http`/`https` pelo protocolo; acrescentar `src=nirva-stage` à query se faltar; enviar `Authorization: Bearer <t>` quando houver token; `normalize(raw, { host: os.hostname() })`; timeout da requisição 1.000 ms; manter a guarda global de 1.500 ms e `process.exit(0)` em qualquer caminho (T020)
- [X] T024 [P] [US2] Em `install-hooks.js` (R09): aceitar `--token` (e `--url` já existente) nos dois modos; comando → `node "<hook>" --nirva-stage [--url <u>] [--token <t>]`; HTTP → `<url>` + `src=nirva-stage` + `host=<encodeURIComponent(os.hostname())>` + `token=<t>`; na saída, substituir o token por `<4 primeiros>…`; atualizar o comentário de uso no topo (T021)
- [X] T025 [US2] Em `server.js`, no `POST /event`, depois de `sanitize`/`normalize`: se `ev.host` estiver vazio, preencher com `?host=` cortado em 32 (mesmo `clip` de `lib/normalize.js`) (T022)

**Checkpoint**: C1 e C3 funcionam contra um palco protegido

---

## Phase 5: User Story 3 - Relay para máquinas com hooks bloqueados (Priority: P3)

**Goal**: o relay lê os transcripts locais e envia resumos ao palco remoto, com fila e reação a
`401`.

**Independent Test**: T09 a T11 com a fixture contra um palco local de teste.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] Criar `test/relay-queue.test.js` (FR-020): `require('../scripts/relay.js')` expõe `createQueue(max)` (o relay só inicia quando `require.main === module`); empurrar 1.005 eventos → tamanho 1.000 e o primeiro é o 6º empurrado
- [X] T027 [P] [US3] Criar `test/relay.test.js` (T09, T10): pasta temporária `<tmp>/projeto-fx/` com `fx-sessao.jsonl` vazio; palco com `NIRVA_TOKEN`; iniciar `node scripts/relay.js --url <palco>/event --token <t> --dir <tmp> --host maq-relay`; anexar as linhas de `test/fixtures/transcripts/main.jsonl` até o `tool_use` `Task`; criar `<tmp>/projeto-fx/fx-sessao/subagents/agent-fx1.jsonl` com o conteúdo da fixture e esperar o `SubagentStart` e o `Grep` chegarem (até 6 s, por causa da varredura de 4 s de `lib/transcripts.js`); anexar o resto de `main.jsonl`; verificar no SSE que chegam os 13 eventos de `expected.json` na ordem, todos com `host: 'maq-relay'`, `project: 'projeto-fx'` e o subagente com `agentType: 'Explore'`; (T10) o texto bruto do SSE não contém `SEGREDO-PROMPT-123`, `CONTEUDO-SECRETO-456`, `--token=XYZ`, `XYZ` nem `/home/fx/secret`
- [X] T028 [P] [US3] Criar `test/relay-errors.test.js` (T11, RF10, FR-024): token errado → stdout/stderr contém "O palco recusou o token (401)" e código 1; sem `--url` e sem `NIRVA_URL` → mensagem de uso e código 1; `--url http://exemplo.invalid/event` → aviso de tráfego não cifrado; `--url http://127.0.0.1:…` → sem aviso; resiliência: relay apontando para porta livre, anexar 3 eventos, depois subir o palco nessa porta → os 3 chegam em ordem em até 5 s; RF15: palco com `--transcripts` numa pasta vazia, `POST /event?src=nirva-stage` não aparece e `POST /event?src=nirva-relay` aparece

### Implementation for User Story 3

- [X] T029 [US3] Criar `scripts/relay.js` (R10, `contracts/cli.md`): argumentos `--url`, `--token`, `--dir` (padrão `~/.claude/projects`), `--host` (padrão `os.hostname()`), fallback `NIRVA_URL`/`NIRVA_TOKEN`; sem URL → uso e saída 1; aviso para `http:` fora de loopback; `transcripts.start({ dir, emit, log, debug: NIRVA_DEBUG === '1' })` de `lib/transcripts.js` sem alterá-lo; `emit` → `normalize(raw, { host })` → `createQueue(1000)` (descarta o mais antigo); laço sequencial para `<url>?src=nirva-relay` com `Authorization: Bearer`, via `http`/`https`; rede, `5xx` ou `429` → espera 2 s e repete o mesmo evento; `401` → "O palco recusou o token (401)", esvazia a fila e `process.exit(1)`; mensagem de início "Relay ligado: <dir> → <host da URL> como <host>"; exportar `createQueue` (T026–T028)
- [X] T030 [US3] Em `.github/workflows/docker-publish.yml`, no job que constrói a imagem, acrescentar o passo "Relay em Docker" (RF13, R11): construir a imagem local, subir `node server.js` no runner com `NIRVA_TOKEN`, rodar `docker run --rm --no-healthcheck --network host -e NIRVA_TOKEN -v <fixture>:/transcripts:ro <imagem> node scripts/relay.js --dir /transcripts --url http://127.0.0.1:4321/event --host ci-docker` em segundo plano, anexar linhas à fixture e verificar com `curl -H "Authorization: Bearer …" /health` que `events` ≥ 1

**Checkpoint**: C2 e C4 funcionam; nenhum conteúdo sensível no fluxo

---

## Phase 6: User Story 4 - Palco multi-máquina e operação (Priority: P4)

**Goal**: rótulos `projeto @máquina`, compose remoto seguro, doctor com token e documentação.

**Independent Test**: T12 e RF12/RF14 com testes próprios; T13 continua verde.

### Tests for User Story 4 ⚠️

- [X] T031 [P] [US4] Criar `test/multi-host.test.js` (T12): ler `public/index.html`, extrair o código entre `// <projName>` e `// </projName>` e avaliá-lo com `vm`; com sessões de um só `host` → `projName(s) === 'proj'`; com sessões de `casa` e `estacao` → `'proj @casa'` e `'proj @estacao'`; com uma sessão sem `host` e outra com `host` → a sem `host` mostra só `proj` e a outra `proj @host`; sessões encerradas não contam
- [X] T032 [P] [US4] Criar `test/compose.test.js` (RF12): o arquivo `docker-compose.remote.yml` contém `127.0.0.1:4321:4321` e `${NIRVA_TOKEN:?`; se `docker compose version` funcionar: `docker compose -f docker-compose.remote.yml config` sem `NIRVA_TOKEN` sai com código ≠ 0 e com `NIRVA_TOKEN=x` sai com 0; sem Docker, pular com `t.skip('Docker indisponível')`
- [X] T033 [P] [US4] Criar `test/doctor.test.js` (RF14): palco com `NIRVA_TOKEN`; `node scripts/doctor.js` sem token → saída contém "exige token" e `NIRVA_TOKEN`; com `NIRVA_TOKEN` certo → saída não contém "exige token" e indica o palco no ar; saída nunca contém o token

### Implementation for User Story 4

- [X] T034 [P] [US4] Em `public/index.html`, guardar `host` na sessão (criação ~linha 396 e preenchimento posterior como `project` ~linha 399) e criar entre `// <projName>` e `// </projName>` a função pura `projName(s, sessions)` (R13): valores distintos de `host` entre sessões não encerradas, com vazio contando como um; mais de um e `s.host` → `` `${s.project || 'Claude'} @${s.host}` ``, senão `s.project || 'Claude'`; usar no chip (~linha 596), no registro (~linha 641), no vocalista (~linha 1121) e na notificação (~linha 1163) (T031)
- [X] T035 [P] [US4] Criar `docker-compose.remote.yml` (R14): serviço com a imagem `ghcr.io/oscarcasagrande/nirva-stage`, `ports: ["127.0.0.1:4321:4321"]`, `environment: NIRVA_TOKEN: ${NIRVA_TOKEN:?defina NIRVA_TOKEN (npm run token)}`, demais opções como em `docker-compose.yml` e comentários em português (T032)
- [X] T036 [P] [US4] Em `scripts/doctor.js`, enviar `Authorization: Bearer $NIRVA_TOKEN` em todas as chamadas ao palco quando definido; se `/health` responder `auth: "required"` sem token (ou `401`), explicar em português que o palco exige token e como definir `NIRVA_TOKEN`; nunca imprimir o token (T033)
- [X] T037 [US4] Em `README.md` (E4 4.4, FR-029): seção "Palco remoto" com `npm run token`, `NIRVA_TOKEN`, Tailscale Serve, Cloudflare Tunnel, hooks remotos (`install-hooks.js --url --token` e `--http`), relay (`npm run relay` e Docker com `:ro`), `docker-compose.remote.yml`, limite de taxa compartilhado atrás de túnel (R06), `NIRVA_INSECURE` e o aviso de governança explícito: nomes de projetos e de arquivos saem da máquina de origem, e o relay nunca é ligado por padrão

**Checkpoint**: todas as histórias funcionando; T01 a T13 verdes

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Em `.github/workflows/docker-publish.yml`, passo "Sintaxe": acrescentar `node --check` para `scripts/relay.js`, `scripts/token.js`, `scripts/doctor.js` e `lib/transcripts.js`
- [X] T039 [P] Criar `test/no-deps.test.js` (constituição I, FR-031): `package.json` sem `dependencies`/`devDependencies`; nenhum `require` de módulo fora dos nativos do Node e dos arquivos locais em `server.js`, `hook.js`, `install-hooks.js`, `lib/*.js` e `scripts/*.js`
- [X] T040 [P] Criar `test/messages-pt.test.js` (constituição VII, FR-032): as mensagens da guarda RS01, da página de login, do relay (401, aviso HTTP, uso) e do doctor (exige token) estão em português (verificar frases exatas de `contracts/`)
- [X] T041 Rodar `npm test` no Windows local e conferir que passa (Node 18+), além do CI Ubuntu/Node 22
- [X] T042 Executar o roteiro de `specs/001-palco-remoto/quickstart.md` §2 a §5 e corrigir divergências
- [X] T043 Remover o comentário "Sync Impact Report" do topo de `.specify/memory/constitution.md` antes do commit
- [ ] T044 Teste manual T14 (Windows real + Tailscale Serve + relay): registrar resultado e tempo medido em `specs/001-palco-remoto/quickstart.md` §6; se passar de 2 s por causa da varredura de 4 s, abrir tarefa para intervalo configurável em `lib/transcripts.js` (R10)
- [ ] T045 Release: `package.json` versão `1.2.0`, changelog 1.2.0 no `README.md`, tag `v1.2.0` e publicação da imagem `ghcr.io/oscarcasagrande/nirva-stage:1.2.0` pelo workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup; T004 MUST passar no código atual antes de qualquer mudança de produto; bloqueia todas as histórias
- **US1 (Phase 3)**: depende da Foundational; **bloqueia US2, US3 e US4** (E1 é pré-requisito no PRD)
- **US2 (Phase 4)** e **US3 (Phase 5)**: dependem de US1; independentes entre si
- **US4 (Phase 6)**: depende de US1; os rótulos usam o `host` da Foundational, testáveis sem US2/US3; o README (T037) descreve US2 e US3, então fazer por último
- **Polish (Phase 7)**: depois de todas as histórias; T045 por último

### Within Each User Story

- Testes primeiro, falhando
- `server.js`: T014 → T015 → T016 → T017 → T018 → T019 → T025 (sempre em sequência)
- `.github/workflows/docker-publish.yml`: T007 → T030 → T038 (em sequência)

### Parallel Opportunities

- Setup: T002 e T003
- Foundational: T005 junto com T004
- US1: testes T008–T011 juntos; T012 e T013 juntos e em paralelo com as tarefas de `server.js`
- US2: testes T020–T022 juntos; T023 e T024 juntos
- US3: testes T026–T028 juntos
- US4: testes T031–T033 juntos; T034, T035 e T036 juntos
- Com US1 pronta, US2 e US3 podem andar em paralelo (só T025 toca `server.js`)

---

## Parallel Example: User Story 1

```bash
# Testes da US1 juntos (todos devem falhar):
Task: "test/exposure.test.js (T01)"
Task: "test/token.test.js (RF05)"
Task: "test/auth.test.js (T02–T05, RS02–RS08)"
Task: "test/rate-limit.test.js (T08)"

# Em paralelo com a sequência de server.js:
Task: "scripts/token.js"
Task: "Dockerfile: NIRVA_IN_DOCKER=1"
```

## Parallel Example: User Story 3

```bash
Task: "test/relay-queue.test.js"
Task: "test/relay.test.js (T09, T10)"
Task: "test/relay-errors.test.js (T11, RF10, RF15)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (T13 verde no código atual)
2. Phase 3 (E1)
3. **PARAR E VALIDAR**: T01–T05, T08 e T13 verdes; mostrar diff e testes (como pede o PRD)
4. Palco local protegido por token já pode ir para trás de um túnel

### Incremental Delivery

1. Setup + Foundational → base
2. US1 → autenticação (MVP)
3. US2 → C1 e C3
4. US3 → C2 e C4
5. US4 → multi-máquina, compose, doctor, README
6. Polish + release 1.2.0 (T14 manual)

---

## Notes

- Cada tarefa cita o teste ou requisito que a valida; commit ao fim de cada tarefa ou grupo
- Pendência fora desta lista: decisão do dono sobre o Princípio II × `lib/normalize.js` (R16,
  Complexity Tracking do plano); não bloqueia nenhuma tarefa
