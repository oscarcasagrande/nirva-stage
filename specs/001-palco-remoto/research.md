# Pesquisa e decisões: Palco Remoto (v1.2)

Fase 0 do plano. Cada item registra Decisão, Justificativa e Alternativas. Não restam
`NEEDS CLARIFICATION`: as três dúvidas da spec foram resolvidas em
[spec.md › Clarifications](spec.md#clarifications).

## R01. Testes de caracterização da v1.1 antes de qualquer mudança

- **Decisão**: o primeiro trabalho é escrever `test/v11-compat.test.js`, que sobe o `server.js`
  atual sem `NIRVA_TOKEN` e fixa o comportamento observável: corpo e status de `/health`, `/`,
  `/vendor/qrcode.js`, `/events` (eventos `retry`, `mode`, `replay`), `POST /event` sempre
  `200 {}`, `src=nirva-stage` ignorado no modo transcript, hook com palco desligado sai com 0.
  A única expectativa que muda depois é `Origin` estranho: `403` → `401` (exceção V.b).
- **Justificativa**: o repositório não tem suíte de testes; o T13 ("testes da v1.1 passam") e o
  Princípio V não teriam o que verificar.
- **Alternativas**: comparar manualmente com a v1.1 (não automatizável, viola o Princípio VI).

## R02. Como os testes sobem o servidor, o hook e o relay

- **Decisão**: processos filhos (`child_process.spawn`) com variáveis de ambiente próprias e porta
  livre obtida com `net.createServer().listen(0)`. O helper espera a linha "Nirva Stage no ar" no
  stdout. Requisições com o `fetch` global (Node 18+), usando `redirect: 'manual'` para o `302`.
  SSE lido com `http.get` e um parser mínimo de `event:`/`data:`.
- **Justificativa**: testa a interface real (variáveis, códigos de saída, mensagens) sem refatorar
  `server.js` para exportar o servidor, e sem dependências (Princípio I).
- **Alternativas**: exportar `createServer()` de `server.js` (mais rápido, mas muda a estrutura do
  arquivo e não cobre RS01, que é sobre o processo encerrar).

## R03. Comparação do token

- **Decisão**: `crypto.timingSafeEqual(sha256(recebido), sha256(esperado))`. O SHA-256 do token
  esperado é calculado uma vez ao iniciar. Fontes, em ordem: `Authorization: Bearer`, `?token=`,
  cookie `nirva_token`; basta uma válida.
- **Justificativa**: RS03; hashes têm tamanho fixo, então `timingSafeEqual` nunca lança por
  tamanho diferente.
- **Alternativas**: comparar strings com `===` (vaza tempo); HMAC (sem ganho aqui).

## R04. Cookie, login e HTTPS atrás do túnel

- **Decisão**: `GET /?token=<certo>` responde `302` com `Location` igual à URL sem o parâmetro
  `token` (preservando os demais, ex.: `?demo`) e `Set-Cookie: nirva_token=<t>; HttpOnly;
  SameSite=Lax; Max-Age=2592000; Path=/`, mais `Secure` quando `x-forwarded-proto` for `https` ou o
  socket for TLS. A página de login é HTML inline em `server.js`, com formulário `GET /` e campo
  `token`; com token errado, volta ao login com aviso "Token inválido" e status `200`.
- **Justificativa**: RF03/RF04/RS07; Tailscale Serve e cloudflared terminam o TLS e enviam
  `X-Forwarded-Proto`. A página fica dentro do servidor porque `public/` exige token.
- **Alternativas**: formulário `POST` (não previsto no PRD); página de login em `public/` (teria
  de ser exceção na proteção dos estáticos).

## R05. Recusa por `Origin`

- **Decisão**: em `POST /event`, sem `Origin` → segue; com `Origin` cujo hostname seja
  `localhost`, `127.0.0.1`, `[::1]` ou igual ao hostname do cabeçalho `Host` → segue; senão `401`
  (com ou sem token). A checagem de `Origin` acontece antes da checagem do token.
- **Justificativa**: FR-013 e clarificação; o próprio palco atrás do túnel tem `Origin` igual ao
  `Host`.
- **Alternativas**: lista de origens configurável (fora do PRD).

## R06. Limite de taxa

- **Decisão**: janela fixa de 10 s por `req.socket.remoteAddress`, `Map` com contador e início da
  janela, limpeza a cada janela. Só com `NIRVA_TOKEN`. Acima de 300 → `429` com corpo `{}`. A
  contagem acontece antes da autenticação, para limitar também tentativas de token.
- **Justificativa**: RS05 e clarificação.
- **Limitação conhecida**: atrás de Tailscale Serve ou cloudflared, todas as máquinas chegam como
  127.0.0.1 e dividem o mesmo limite de 300/10 s. Não usamos `X-Forwarded-For` porque é forjável.
  Fica documentado no README. Com o volume típico (dezenas de eventos por minuto por sessão), o
  limite é folgado.
- **Alternativas**: token bucket (mais complexo, mesmo efeito para o T08); `X-Forwarded-For`
  (forjável).

## R07. Campo `host`

- **Decisão**: `normalize()` e `sanitize()` ganham `host` (`clip(…, 32)`). `hook.js` e o relay
  preenchem com `os.hostname()` (ou `--host`). No servidor, `ev.host ||= clip(?host=, 32)`. O
  campo vale sempre (clarificação).
- **Justificativa**: RF06, RF08 e o formato do evento normalizado no PRD.

## R08. `hook.js` remoto

- **Decisão**: URL de `--url` > `NIRVA_URL` > `http://127.0.0.1:${NIRVA_PORT||4321}/event`; token
  de `--token` > `NIRVA_TOKEN`. Escolhe `http` ou `https` pelo protocolo; acrescenta
  `src=nirva-stage` à query se faltar; manda `Authorization: Bearer` se houver token. Timeout da
  requisição sobe de 400 ms para 1.000 ms; a guarda global de 1.500 ms continua e garante a saída
  com código 0.
- **Justificativa**: RF06 e Princípio III; o handshake TLS remoto não cabe em 400 ms.
- **Alternativas**: manter 400 ms (eventos perdidos em HTTPS remoto).

## R09. Instalador

- **Decisão**: hook de comando grava `node "<hook.js>" --nirva-stage --url <u> --token <t>`; hook
  HTTP grava `<url>?src=nirva-stage&host=<hostname>&token=<t>`. A saída substitui o token por
  `abcd…` (4 primeiros caracteres + reticências). A remoção de entradas antigas já existe
  (`isOurs`) e cobre a reinstalação.
- **Justificativa**: RF07, RS07, E2 2.2.
- **Nota**: o token fica em texto puro no `settings.json` do usuário; é inevitável sem cabeçalho
  com variável de ambiente (questão em aberto do PRD). O README orienta trocar com `npm run token`
  em caso de vazamento.

## R10. Relay

- **Decisão**: `scripts/relay.js` chama `transcripts.start({ dir, emit })` de `lib/transcripts.js`
  sem alterá-lo; cada payload bruto passa por `normalize()` na origem, recebe `host` e entra numa
  fila (array, máximo 1.000, descarta o mais antigo). Um laço envia um evento por vez, em ordem,
  para `<url>?src=nirva-relay` com `Authorization: Bearer`. Rede indisponível, `5xx` ou `429` →
  espera 2 s e tenta o mesmo evento de novo. `401` → "O palco recusou o token (401)", descarta a
  fila e sai com código 1. Destino `http:` fora de loopback → aviso ao iniciar. Argumentos:
  `--url`, `--token`, `--dir` (padrão `~/.claude/projects`), `--host` (padrão `os.hostname()`),
  com `NIRVA_URL`/`NIRVA_TOKEN` como alternativa.
- **Justificativa**: RF09, RF10, RS06; o envio sequencial garante a ordem do T09.
- **Limitação conhecida**: `lib/transcripts.js` procura arquivos novos a cada 4 s; o primeiro
  evento de uma sessão recém-criada pode levar até ~4 s. Eventos seguintes saem em ~0,7 s. O T14
  mede o caso real; se reprovar, a mudança em `lib/transcripts.js` (intervalo configurável) vira
  tarefa própria, porque afeta o modo transcript da v1.1.
- **Alternativas**: reimplementar o parser no relay (duplicação; o PRD pede reaproveitamento).

## R11. Relay em Docker

- **Decisão**: mesma imagem; `docker run --rm -v ~/.claude/projects:/transcripts:ro
  -e NIRVA_TOKEN ghcr.io/oscarcasagrande/nirva-stage:1.2.0 node scripts/relay.js --dir
  /transcripts --url <palco> --host $COMPUTERNAME` (ou `$(hostname)`), com `--no-healthcheck`,
  já que o HEALTHCHECK da imagem é do palco.
- **Justificativa**: RF13 sem uma segunda imagem.
- **Teste**: passo no CI, depois do build da imagem, rodando o relay em contêiner contra um palco
  local com transcript de fixture montado `:ro`.

## R12. Guarda de exposição

- **Decisão**: ao iniciar, se `NIRVA_HOST` não for `127.0.0.1`, `::1` ou `localhost` e não houver
  `NIRVA_TOKEN`: com `NIRVA_IN_DOCKER=1` segue; com `NIRVA_INSECURE=1` segue com aviso; senão
  imprime a mensagem da RS01 em português e sai com código 1. O `Dockerfile` passa a declarar
  `NIRVA_IN_DOCKER=1`.
- **Justificativa**: RS01, FR-007, emenda IV/V da constituição 1.1.0.

## R13. Rótulos multi-máquina

- **Decisão**: em `public/index.html`, a sessão guarda `host`; uma função pura `projName(s)`
  devolve `projeto @host` quando há mais de um valor distinto de `host` entre as sessões ativas
  (vazio conta como um valor) e a sessão tem `host`; senão só `projeto`. Ela substitui o uso de
  `s.project` no vocalista, chip, registro e notificação. A função fica entre marcadores
  `// <projName>` … `// </projName>` para o teste carregá-la com `vm`, sem navegador.
- **Justificativa**: RF11 e T12 automatizáveis sem dependências.

## R14. Compose remoto e doctor

- **Decisão**: `docker-compose.remote.yml` usa `NIRVA_TOKEN: ${NIRVA_TOKEN:?defina NIRVA_TOKEN
  (npm run token)}` e `ports: ["127.0.0.1:4321:4321"]`. O doctor envia `Authorization: Bearer`
  quando houver `NIRVA_TOKEN` e, se `/health` disser `auth: "required"` sem token, explica como
  definir. Teste do compose: `docker compose -f docker-compose.remote.yml config` sem token deve
  falhar (pulado se não houver Docker; no CI Ubuntu há).

## R15. Execução dos testes e CI

- **Decisão**: arquivos `test/*.test.js` com `node:test` e `node:assert/strict`; script
  `"test": "node --test"` no `package.json`; passo "Testes" no job `check` de
  `.github/workflows/docker-publish.yml`, antes do teste de fumaça; passo do relay em Docker no job
  de imagem.
- **Justificativa**: Princípios I e VI; Node 22 no CI.

## R16. Achado: o resumo atual é mais largo que o Princípio II

- **Achado**: `lib/normalize.js` (desde a v1.0) envia, além do que o Princípio II lista, o padrão
  do `Grep`/`Glob`, a consulta do `WebSearch`, a `description` do `Bash`/`PowerShell` e o texto das
  notificações. A RS06 do PRD diz que "continua valendo a regra da v1.0", então o PRD trata esse
  comportamento como aceito; o texto literal da constituição, não.
- **Decisão (C1-b, adotada na implementação)**: `normalize(raw, { strict: true })` restringe o
  resumo ao que o Princípio II permite (nome do arquivo, primeira palavra do comando, host da URL,
  tipo do subagente; sem padrões de busca, consultas, descrições nem texto de notificação). É usado
  pelo relay (sempre), pelo `hook.js` com destino fora do loopback e pelo palco com `NIRVA_TOKEN`
  para payloads brutos. Sem token e em loopback, o resumo da v1.1 não muda.
- **Pendente**: o hook HTTP do Claude Code envia o payload completo ao palco antes de qualquer
  resumo; o palco descarta o resto, mas o conteúdo atravessa a rede. O instalador e o README
  avisam. Fica para decisão do dono se isso exige emenda ao Princípio II.
