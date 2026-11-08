# Contrato HTTP do palco (v1.2)

Fonte: PRD, "Arquitetura e contratos". "Auth ligada" = `NIRVA_TOKEN` definido. Sem token, todas as
rotas se comportam como na v1.1, exceto a recusa por `Origin` (`401` em vez de `403`).

## Token

Aceito em qualquer uma das fontes (basta uma válida):

1. `Authorization: Bearer <token>`
2. `?token=<token>`
3. cookie `nirva_token=<token>`

## Rotas

| Rota | Método | Auth ligada: sem token válido | Auth ligada: com token | Auth desligada |
| --- | --- | --- | --- | --- |
| `/` e `/index.html` | GET | `200` página de login | `200` palco; se veio por `?token=`: `302` + `Set-Cookie` | `200` palco (v1.1) |
| `/vendor/qrcode.js` | GET | `401` | `200` | `200` (v1.1) |
| `/events` | GET (SSE) | `401` | `200` stream: `retry`, `mode`, `replay`, `docker`, dados | igual (v1.1) |
| `/event` | POST | `401` | `200 {}` | `200 {}` (v1.1) |
| `/health` | GET | `200 {"ok":true,"auth":"required"}` | `200` detalhes v1.1 + `"auth":"required"` | `200` detalhes v1.1 |
| outras | qualquer | `404` | `404` | `404` |

### `POST /event`, ordem de verificação

1. `Origin` presente e estranho → `401`. Aceitos: hostname loopback; com auth ligada, também hostname igual ao do `Host` (sem auth não, para evitar DNS rebinding).
2. Auth ligada e mais de 300 POSTs deste IP nos últimos 10 s → `429 {}`.
3. Auth ligada e token inválido → `401`.
4. Corpo lido (máx. 2 MB guardados), `sanitize` (se `v:1`) ou `normalize`.
5. `host` vazio → `?host=` (cortado em 32).
6. Modo transcript e `?src=nirva-stage` → descarta.
7. Sempre `200 {}` (mesmo com corpo inválido).

Nunca responde `403` (Princípio III, RS04).

### `GET /?token=<certo>`

```
HTTP/1.1 302 Found
Location: /            (a URL original sem o parâmetro token; ex.: /?demo)
Set-Cookie: nirva_token=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000[; Secure]
```

`Secure` quando `X-Forwarded-Proto: https` ou conexão TLS.

### Página de login

HTML mínimo em português: título, campo `token` (tipo senha), botão "Entrar", envio por `GET /`.
Com `?token=` errado, mostra "Token inválido" (status `200`). Não carrega nenhum arquivo de
`public/`.

## Inicialização (RS01)

| `NIRVA_HOST` | `NIRVA_TOKEN` | `NIRVA_IN_DOCKER` | `NIRVA_INSECURE` | Resultado |
| --- | --- | --- | --- | --- |
| loopback (`127.0.0.1`, `::1`, `localhost`) | qualquer | qualquer | qualquer | inicia |
| outro | definido | qualquer | qualquer | inicia |
| outro | vazio | `1` | qualquer | inicia |
| outro | vazio | — | `1` | inicia com aviso "exposto sem token" |
| outro | vazio | — | — | encerra com código 1 e mensagem em português |
