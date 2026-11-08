# Quickstart de validação: Palco Remoto (v1.2)

Roteiro para provar que a v1.2 funciona de ponta a ponta. Detalhes de rotas e opções:
[contracts/http.md](contracts/http.md) e [contracts/cli.md](contracts/cli.md).

## Pré-requisitos

- Node 18+ (CI: Node 22 no Ubuntu).
- Docker, para os cenários de compose e relay em contêiner (opcional localmente).

## 1. Suíte automatizada (T01 a T13)

```bash
npm test
```

Esperado: todos os testes passam. Mapa teste → arquivo:

| PRD | Arquivo | Cobre |
| --- | --- | --- |
| T13 | `test/v11-compat.test.js` | comportamento sem `NIRVA_TOKEN` |
| T01, FR-007 | `test/exposure.test.js` | guarda RS01, `NIRVA_IN_DOCKER`, `NIRVA_INSECURE`, Dockerfile |
| T02–T05, RS02–RS08 | `test/auth.test.js` | 401, login, cookie, 302, Origin, DNS rebinding |
| T08 | `test/rate-limit.test.js` | 300 × 200, 20 × 429 |
| RF05 | `test/token.test.js` | 32 caracteres base64url |
| FR-022 (C1-b) | `test/normalize.test.js` | campo `host`, modo estrito |
| T06, FR-015, SC-001 | `test/hook-remote.test.js` | `--url`/`--token`, env, HTTPS, saída 0, latência < 1 s |
| T07, RF07 | `test/install-hooks.test.js` | query do hook HTTP, máscara, aviso, sem duplicar |
| T07, FR-018 | `test/host-query.test.js` | `?host=` |
| T10 (hooks) | `test/privacy-hooks.test.js` | resumo estrito no hook HTTP e no hook remoto |
| T09, T10, I1 | `test/relay.test.js` | 13 eventos em ordem, privacidade, latência < 2 s |
| T11, RF10, RF15 | `test/relay-errors.test.js` | 401, uso, aviso HTTP, resiliência, src |
| FR-020 | `test/relay-queue.test.js` | fila de 1.000 |
| FR-025 | `test/no-relay-default.test.js` | relay nunca ligado por padrão |
| T12, G1 | `test/multi-host.test.js` | `projName` e os 4 pontos de uso |
| RF12 | `test/compose.test.js` | compose sem token falha |
| RF14 | `test/doctor.test.js` | aviso de token, máscara |
| FR-029 | `test/readme.test.js` | aviso de governança no README |
| FR-031 | `test/no-deps.test.js` | zero dependências |
| FR-032 | `test/messages-pt.test.js` | mensagens em português |
| RF13 | job `relay-docker` do CI | relay em contêiner com `:ro` |

## 2. Palco protegido, à mão

```bash
export NIRVA_TOKEN=$(npm run -s token)
npm run serve
curl -i http://127.0.0.1:4321/events                      # 401
curl -i "http://127.0.0.1:4321/?token=$NIRVA_TOKEN"       # 302 + Set-Cookie
curl -s http://127.0.0.1:4321/health                      # {"ok":true,"auth":"required"}
```

Abrir `http://localhost:4321` no navegador: página de login; colar o token; o palco abre e a URL
fica sem `?token=`.

## 3. Hook remoto (C1)

```bash
echo '{"hook_event_name":"SessionStart","session_id":"qs","cwd":"/tmp/qs"}' \
  | node hook.js --nirva-stage --url http://127.0.0.1:4321/event --token "$NIRVA_TOKEN"
```

Esperado: o vocalista `qs` aparece no palco; código de saída 0.

## 4. Relay (C2)

```bash
npm run relay -- --url http://127.0.0.1:4321/event --token "$NIRVA_TOKEN" --host estacao-teste
```

Usar o Claude Code nesta máquina: os músicos aparecem no palco. Com duas origens (passos 3 e 4),
os rótulos viram `projeto @máquina`. Com token errado: "O palco recusou o token (401)".

## 5. Compose remoto e relay em Docker

```bash
unset NIRVA_TOKEN; docker compose -f docker-compose.remote.yml config   # falha
NIRVA_TOKEN=... docker compose -f docker-compose.remote.yml up -d       # porta só em 127.0.0.1
```

## 6. Manual (T14)

Windows real com Claude Code em conta corporativa + relay + Tailscale Serve no palco de casa:
o vocalista da estação aparece em menos de 2 s.
