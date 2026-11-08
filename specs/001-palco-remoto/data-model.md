# Modelo de dados: Palco Remoto (v1.2)

Tudo fica em memória; não há banco. Requisitos citados: ver [spec.md](spec.md).

## Evento normalizado (v1)

Resumo de uma ação do Claude Code. É gerado na origem (`normalize`) e revalidado no palco
(`sanitize`).

| Campo | Tipo | Limite | Regra |
| --- | --- | --- | --- |
| `v` | número | — | sempre `1` |
| `event` | texto | — | um dos 12 tipos de `EVENTS` em `lib/normalize.js`; outro → descarta |
| `session` | texto | 64 | vazio → `local` |
| `agent` | texto | 64 | id do subagente ou vazio |
| `agentType` | texto | 28 | tipo do subagente (ex.: `Explore`) |
| `tool` | texto | 60 | nome da ferramenta |
| `detail` | texto | 40 | resumo seguro (nome do arquivo sem caminho, primeira palavra do comando, host da URL…) |
| `project` | texto | 40 | último segmento do `cwd` |
| `note` | texto | 80 | texto curto de notificação ou `compactando contexto` |
| `ntype` | texto | 32 | tipo de notificação |
| **`host`** | texto | **32** | **novo na v1.2**: nome da máquina de origem; vazio se desconhecido; espaços e quebras de linha normalizados por `clip` |
| `ts` | número | — | sempre sobrescrito pelo palco com `Date.now()` |

Regras de origem do `host` (FR-014, FR-018):

1. o próprio evento (`hook.js`, relay);
2. senão, o parâmetro `?host=` do `POST /event` (hook HTTP);
3. senão, vazio.

O `src` da query (`nirva-stage` ou `nirva-relay`) **não** é campo do evento; só decide o descarte
no modo transcript (FR-024).

## Token do palco

| Atributo | Regra |
| --- | --- |
| valor | `NIRVA_TOKEN`; `npm run token` gera 24 bytes aleatórios → 32 caracteres base64url |
| resumo | SHA-256 calculado ao iniciar; só ele é comparado (`timingSafeEqual`) |
| exposição | nunca em log; mascarado (`abcd…`) na saída do instalador |

## Sessão do navegador (cookie)

| Atributo | Valor |
| --- | --- |
| nome | `nirva_token` |
| valor | o próprio token |
| flags | `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (+ `Secure` atrás de HTTPS) |
| invalidação | trocar `NIRVA_TOKEN` invalida todos os cookies |

## Janela de taxa (servidor, só com token)

`Map<ip, { inicio, contagem }>`. Janela de 10 s; `contagem > 300` → `429`. Entradas expiradas são
removidas a cada janela.

## Fila do relay (origem)

| Atributo | Regra |
| --- | --- |
| capacidade | 1.000 eventos; cheia → descarta o mais antigo |
| envio | um por vez, em ordem |
| estados | `enviando` → (`200`) próximo · (rede, `5xx`, `429`) `esperando 2 s` → `enviando` · (`401`) `parado` (fila descartada, código 1) |

## Máquina de origem (navegador)

Cada sessão do palco guarda `host` do primeiro evento que o trouxer. `projName(s)`:

- valores distintos de `host` entre as sessões ativas (vazio conta como um) ≤ 1 → `projeto`;
- mais de um e a sessão tem `host` → `projeto @host`;
- mais de um e a sessão não tem `host` → `projeto`.
