# Implementation Plan: Palco Remoto (v1.2)

**Branch**: `001-palco-remoto` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-palco-remoto/spec.md`

## Summary

O palco passa a receber eventos de outras máquinas, protegido por um token único. O servidor
ganha autenticação (Bearer, query ou cookie, comparação em tempo constante), página de login,
guarda de exposição, recusa por `Origin` com `401` e limite de taxa. `hook.js` e
`install-hooks.js` passam a apontar para palcos remotos (HTTP/HTTPS) e enviar `host`. Um relay
novo reaproveita `lib/transcripts.js` para levar eventos de máquinas com hooks bloqueados. O
navegador mostra `projeto @máquina` quando há mais de uma origem. Tudo com módulos nativos do Node
e coberto por testes `node:test` (T01 a T13) no CI. Decisões técnicas: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript (CommonJS), Node.js 18+ (CI: Node 22)

**Primary Dependencies**: nenhuma; só `http`, `https`, `crypto`, `fs`, `path`, `os`, `net`,
`child_process`, `vm`, `node:test`. Exceção já existente: `public/vendor/qrcode.js`

**Storage**: memória (histórico de 500 eventos / 2 h; janela de taxa; fila do relay)

**Testing**: `node:test` + `node:assert/strict`, processos filhos reais (`npm test`)

**Target Platform**: Windows, macOS e Linux (origem e palco); imagem Docker `node:22-alpine`

**Project Type**: ferramenta local: servidor HTTP + SSE, CLIs (hook, instalador, relay, token,
doctor) e página web estática

**Performance Goals**: hook ≤ 1,5 s sempre com código 0; ação → palco ≤ 1 s via hook e ≤ 2 s via
relay; suporta 300 POSTs/10 s por IP

**Constraints**: zero dependências npm; nada de conteúdo sai da origem; `/event` nunca `403`;
sem `NIRVA_TOKEN` igual à v1.1 (com as exceções da constituição 1.1.0); mensagens em português

**Scale/Scope**: um palco, poucas máquinas de origem (2 a ~5), um usuário; ~8 arquivos alterados,
3 novos de produto, 21 arquivos de teste

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constituição v1.1.0.

| Princípio | Verificação | Pré-pesquisa | Pós-design |
| --- | --- | --- | --- |
| I. Zero dependências | Só módulos nativos; `package.json` continua sem `dependencies` | ✅ | ✅ (R02, R15: testes também nativos) |
| II. Privacidade | `normalize` roda na origem em hook e relay; servidor revalida com `sanitize`; T10 no fluxo SSE | ✅ | ⚠️ ver Complexity Tracking (R16) |
| III. Nunca atrapalhar | hook com guarda de 1,5 s e saída 0; `/event` só `200`/`401`/`429`; `403` da v1.1 removido | ✅ | ✅ (R05, R08) |
| IV. Seguro por padrão | escuta `127.0.0.1`; fora do loopback exige token, salvo `NIRVA_IN_DOCKER`/`NIRVA_INSECURE` (exceções da 1.1.0); token nunca em log | ✅ | ✅ (R12, R09) |
| V. Compatibilidade | testes de caracterização da v1.1 antes das mudanças; exceções V.a–c explícitas; limite de taxa só com token | ✅ | ✅ (R01, R06) |
| VI. Testes antes | cada FR mapeado a teste (quickstart §1); ordem teste → código em cada história | ✅ | ✅ |
| VII. Português | login, avisos do relay, guarda RS01, doctor e README em português | ✅ | ✅ |

Resultado: **aprovado**, com uma pendência registrada (Complexity Tracking) que não bloqueia o
plano.

## Project Structure

### Documentation (this feature)

```text
specs/001-palco-remoto/
├── plan.md              # este arquivo
├── research.md          # Fase 0: decisões R01–R16
├── data-model.md        # Fase 1: evento, token, cookie, taxa, fila
├── quickstart.md        # Fase 1: roteiro de validação e mapa de testes
├── contracts/
│   ├── http.md          # rotas, ordem de verificação, inicialização
│   └── cli.md           # token, hook, instalador, relay, doctor, compose
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server.js                    # auth, login, cookie, Origin→401, taxa, ?host=, guarda RS01, /health
hook.js                      # --url/--token, NIRVA_URL, https, host, timeout 1.000 ms
install-hooks.js             # --url/--token nos dois modos, host na query HTTP, máscara
lib/normalize.js             # campo host em normalize() e sanitize()
lib/transcripts.js           # reaproveitado sem mudança pelo relay
public/index.html            # host na sessão, projName() entre marcadores
scripts/relay.js             # NOVO: transcripts → normalize → fila → palco remoto
scripts/token.js             # NOVO: 24 bytes aleatórios em base64url
scripts/doctor.js            # Bearer com NIRVA_TOKEN, aviso de auth
docker-compose.remote.yml    # NOVO: exige NIRVA_TOKEN, porta 127.0.0.1:4321
Dockerfile                   # + NIRVA_IN_DOCKER=1 (FR-007)
package.json                 # scripts token, relay, test; versão 1.2.0
.github/workflows/docker-publish.yml   # passo npm test; passo relay em Docker
README.md                    # túneis, relay, aviso de governança, changelog 1.2.0

test/
├── helpers.js               # porta livre, sobe servidor/hook/relay, leitor SSE
├── fixtures/transcripts/    # sessão simulada do T09
├── v11-compat.test.js       # T13
├── exposure.test.js         # T01
├── auth.test.js             # T02–T05, RS02, RS03, RS07, RS08
├── rate-limit.test.js       # T08
├── token.test.js            # RF05
├── hook-remote.test.js      # T06, FR-015
├── install-hooks.test.js    # T07, RF07, E2 2.2
├── relay.test.js            # T09–T11, RF10, RF15
├── multi-host.test.js       # T12
├── compose.test.js          # RF12
└── doctor.test.js           # RF14
```

**Structure Decision**: mantém a estrutura plana atual (arquivos na raiz, `lib/`, `scripts/`,
`public/`) e acrescenta só `test/`. Além dos arquivos listados no pedido, o plano precisa tocar
`Dockerfile` (FR-007, para não quebrar a imagem da v1.1), `package.json` (scripts), `scripts/doctor.js`
(RF14), o workflow de CI e o README; nenhum deles introduz dependência. A autenticação fica dentro
de `server.js` para respeitar a lista de arquivos pedida; se crescer, pode virar `lib/auth.js` numa
tarefa de refatoração.

### Ordem de entrega (história → épico do PRD)

1. **Base**: `test/helpers.js` + `test/v11-compat.test.js` (T13) passando no código atual.
2. **US1 / E1 (P1, bloqueia o resto)**: exposure → auth → rate-limit → token.
3. **US2 / E2 (P2)**: `normalize` com `host` → hook → instalador → `?host=`.
4. **US3 / E3 (P3)**: relay + fixtures → resiliência → Docker.
5. **US4 / E4 (P4)**: `projName` → compose → doctor → README.
6. **Release**: versão 1.2.0, tag `v1.2.0`, imagem no GHCR, T14 manual.

## Complexity Tracking

| Violação | Por que existe | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Princípio II: o hook HTTP do Claude Code (C3) envia o payload completo ao palco remoto (o resumo estrito C1-b só se aplica depois de chegar) | RF07 do PRD exige o hook HTTP remoto para máquinas sem Node | Aviso no instalador e no README; hook de comando e relay resumem na origem. **Decisão do dono pendente**: emendar o II para esse caso ou restringir o hook HTTP a loopback |
| Limite de taxa por IP vira limite global atrás de túnel (R06) | Túneis chegam como 127.0.0.1; `X-Forwarded-For` é forjável | Documentado no README; 300/10 s é folgado para poucas máquinas |
