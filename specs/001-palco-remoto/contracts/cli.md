# Contrato de linha de comando (v1.2)

Precedência geral: opção da linha de comando > variável de ambiente > padrão. Toda saída é em
português e nunca mostra o token completo.

## `npm run token` (`scripts/token.js`) — RF05

- Saída: uma linha com 32 caracteres `[A-Za-z0-9_-]` (24 bytes aleatórios em base64url).
- Código de saída: 0.

## `hook.js` — RF06

```
node hook.js --nirva-stage [--url <url>] [--token <token>]
```

| Opção | Variável | Padrão |
| --- | --- | --- |
| `--url` | `NIRVA_URL` | `http://127.0.0.1:${NIRVA_PORT or 4321}/event` |
| `--token` | `NIRVA_TOKEN` | vazio (sem cabeçalho `Authorization`) |

- Lê o payload do Claude Code no stdin; envia o evento normalizado com `host = os.hostname()`
  (32 caracteres no máximo) para a URL com `src=nirva-stage` na query.
- Aceita `http:` e `https:`.
- Sempre sai com código 0 em até 1,5 s, sem escrever nada no stdout.

## `install-hooks.js` — RF07

```
node install-hooks.js [--http] [--url <url>] [--token <token>] [--settings <arquivo>] [--uninstall]
```

| Modo | O que grava em cada evento |
| --- | --- |
| comando (padrão) | `node "<caminho>/hook.js" --nirva-stage [--url <url>] [--token <token>]` |
| `--http` | `<url>?src=nirva-stage&host=<os.hostname()>[&token=<token>]` |

- Remove antes as entradas do Nirva Stage (reinstalar não duplica).
- Saída: o token aparece como `<4 primeiros>…`.

## `npm run relay -- …` (`scripts/relay.js`) — RF09, RF10

```
npm run relay -- --url <url> --token <token> [--dir <pasta>] [--host <nome>]
```

| Opção | Variável | Padrão |
| --- | --- | --- |
| `--url` | `NIRVA_URL` | obrigatório |
| `--token` | `NIRVA_TOKEN` | vazio |
| `--dir` | — | `~/.claude/projects` |
| `--host` | — | `os.hostname()` |

| Situação | Mensagem / comportamento |
| --- | --- |
| início | "Relay ligado: <dir> → <host da URL> como <host>" |
| URL `http:` fora de loopback | aviso de que o tráfego não é cifrado |
| palco inacessível, `5xx` ou `429` | guarda até 1.000 eventos, tenta de novo a cada 2 s |
| `401` | "O palco recusou o token (401)", descarta a fila, sai com código 1 |
| sem `--url` | explica o uso e sai com código 1 |

Envia para `<url>?src=nirva-relay` com `Authorization: Bearer <token>`.

Em Docker (RF13):

```
docker run --rm --no-healthcheck -e NIRVA_TOKEN \
  -v "$HOME/.claude/projects:/transcripts:ro" \
  ghcr.io/oscarcasagrande/nirva-stage:1.2.0 \
  node scripts/relay.js --dir /transcripts --url https://<palco>/event --host "$(hostname)"
```

## `npm run doctor` — RF14

- Com `NIRVA_TOKEN`, envia `Authorization: Bearer` em todas as chamadas ao palco.
- Se `/health` responder `auth: "required"` e não houver token: explica que o palco exige token e
  como definir `NIRVA_TOKEN`.

## `docker-compose.remote.yml` — RF12

- Sem `NIRVA_TOKEN` no ambiente: `docker compose` falha antes de subir, com a mensagem
  "defina NIRVA_TOKEN (npm run token)".
- Porta publicada só em `127.0.0.1:4321`.
