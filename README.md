# 🎸 Nirva Stage

**Seus agentes do Claude Code como uma banda de rock em pixel art, ao vivo no navegador.**

[![Nirva Stage ao vivo](docs/demo.gif)](docs/demo.mp4)

O Nirva Stage é um **visualizador de agentes**, uma espécie de painel de observabilidade em forma de jogo.
Ele não controla o Claude Code: só observa, pelos [hooks](https://docs.claude.com/en/docs/claude-code/hooks), o que cada agente está fazendo e mostra isso no palco.

- 🎤 **Vocalistas:** o agente principal de cada sessão canta no microfone. São até 3 projetos na frente do palco, cada um com a sua cor.
- 🎻 **Orquestra rock:** cada subagente pega um instrumento livre: guitarra, baixo, bateria, teclado, synth, sax, sanfona, violino, flauta, violoncelo, harpa, trompete, trombone, clarinete, tuba e percussão.
- 🔊 **Containers Docker** de pé viram amplificadores na parede, na cor do projeto, com LED de status.
- 🚦 **Estados claros:** lendo, escrevendo, terminal, web, MCP, esperando permissão (luz âmbar piscando, som e notificação) e fim do turno (confete e plateia pulando).
- 🔒 **100% local:** nada sai da sua máquina, e o palco nunca recebe conteúdo de arquivos nem o texto dos seus prompts.

> **Teste sem instalar nada:** abra o palco com `?demo` no fim do endereço (`http://localhost:4321/?demo`) para ver eventos simulados.

---

## 🚀 Instalação

### Opção A: Docker (não precisa de Node na máquina)

**Windows (PowerShell)**

```powershell
# 1. sobe o palco (porta publicada só em 127.0.0.1)
docker run -d --name nirva-stage --restart unless-stopped -p 127.0.0.1:4321:4321 ghcr.io/oscarcasagrande/nirva-stage:latest

# 2. instala os hooks HTTP no seu Claude Code (faz backup antes)
docker run --rm -v "$env:USERPROFILE\.claude:/claude" ghcr.io/oscarcasagrande/nirva-stage node install-hooks.js --http --settings /claude/settings.json
```

**macOS / Linux (bash/zsh)**

```bash
docker run -d --name nirva-stage --restart unless-stopped -p 127.0.0.1:4321:4321 ghcr.io/oscarcasagrande/nirva-stage:latest
docker run --rm --user "$(id -u):$(id -g)" -v "$HOME/.claude:/claude" ghcr.io/oscarcasagrande/nirva-stage node install-hooks.js --http --settings /claude/settings.json
```

> Rode só o bloco do seu sistema. O `--settings /claude/...` é um caminho **dentro do container**: não rode o `install-hooks.js` com essa opção fora do Docker.

Abra **http://localhost:4321** e inicie uma sessão **nova** do `claude`.

**Para ver os containers na parede**, use o `docker-compose.yml` do repositório:

```bash
git clone https://github.com/oscarcasagrande/nirva-stage && cd nirva-stage
docker compose up -d
```

Ele monta o socket do Docker como somente leitura, e o palco só chama `GET /containers/json`.
Saiba que quem acessa o socket do Docker tem, na prática, poder de administrador no Docker. Se não quiser isso, apague o volume no compose.

### Opção B: Node.js 18+ (nativo)

```bash
git clone https://github.com/oscarcasagrande/nirva-stage && cd nirva-stage
npm run install-hooks   # hook de comando, faz backup do settings.json
npm start               # abre http://localhost:4321
```

No modo nativo, os containers aparecem pelo comando `docker ps` (se o Docker estiver instalado). Não precisa de configuração.

> **Comando ou HTTP?** O hook de comando (opção B) é silencioso: com o palco desligado, o Claude Code nem percebe.
> O hook HTTP (opção A) dispensa Node. Se o palco estiver desligado, o Claude Code pode mostrar um aviso de hook com falha, mas continua normal.

### Opção C: modo transcript (quando a empresa bloqueia hooks)

Algumas organizações liberam só os hooks definidos por elas. Nesses casos, o `/hooks` do Claude Code mostra **"managed hooks only"** e os hooks do Nirva Stage são ignorados.
No modo transcript, o palco **não usa hooks**: ele lê, só para leitura, o histórico que o Claude Code grava em `~/.claude/projects/`.

```powershell
# Node (nativo)
npm run start:transcripts

# Docker (monta ~/.claude/projects como somente leitura)
docker compose -f docker-compose.yml -f docker-compose.transcripts.yml up -d
```

Ligado assim, o palco mostra **"ao vivo · transcript"** e ignora os eventos dos hooks, para não contar nada duas vezes.

**Limitações em relação aos hooks:**

- Os eventos chegam com cerca de 1 s de atraso.
- O pedido de permissão (luz âmbar) não aparece, porque não fica registrado no histórico.
- Ao ligar, só sobem ao palco as sessões mexidas nos últimos 15 minutos. O palco não reprisa o histórico antigo.

> Os arquivos de histórico têm o conteúdo das suas conversas. O Nirva Stage lê esses arquivos só no servidor local e manda para o palco apenas o resumo de sempre: nome da ferramenta e nome do arquivo.
> Em máquina corporativa, confirme se isso está de acordo com a política da sua empresa.

### Algo não funciona?

```bash
npm run doctor              # palco, hooks, bloqueios e um evento de teste
npm run doctor -- --claude  # também roda o Claude Code de verdade e conta os eventos que chegaram
```

### Desinstalar

```bash
npm run uninstall-hooks
# ou, no Docker:
docker run --rm -v "$env:USERPROFILE\.claude:/claude" ghcr.io/oscarcasagrande/nirva-stage node install-hooks.js --uninstall --settings /claude/settings.json   # Windows
```

Isso remove só as entradas do Nirva Stage e mantém seus outros hooks. Os backups ficam em `~/.claude/settings.json.nirva-backup-*`.

---

## 🌐 Palco remoto (v1.2)

Um palco só para os agentes de várias máquinas: o PC de casa, o notebook, a estação do trabalho, um servidor. Cada sessão aparece como `projeto @máquina` quando há mais de uma máquina no palco.

> **⚠️ Aviso de governança (máquinas corporativas):** no envio remoto, nomes de projetos e de arquivos saem da máquina de origem e vão para o seu palco. Antes de ligar o relay ou os hooks remotos numa máquina da empresa, peça aprovação a quem cuida da política de segurança. O relay nunca é ligado por padrão: ele só roda quando você executa `npm run relay`.

### 1. Proteja o palco com um token

```bash
npm run -s token                      # gera um token aleatório (32 caracteres)
export NIRVA_TOKEN=<token>            # PowerShell: $env:NIRVA_TOKEN = "<token>"
npm start
```

Com `NIRVA_TOKEN` definido, nada entra nem sai sem o token: enviar eventos, abrir a página e baixar arquivos. Ao abrir o palco, o navegador mostra uma página de login; digite o token uma vez e ele fica num cookie `HttpOnly` por 30 dias (a URL não guarda o token). Sem `NIRVA_TOKEN`, tudo funciona como na v1.1.

No Docker, use o compose remoto, que se recusa a subir sem token e mantém a porta só em `127.0.0.1`:

```bash
export NIRVA_TOKEN=<token>
docker compose -f docker-compose.remote.yml up -d
```

O palco se recusa a iniciar exposto na rede (`NIRVA_HOST` fora de `127.0.0.1`) sem token. Exceções explícitas: `NIRVA_IN_DOCKER=1` (já vem na imagem: dentro do contêiner o palco escuta em `0.0.0.0`, mas a porta é publicada só em `127.0.0.1`) e `NIRVA_INSECURE=1` (expõe sem token por sua conta e risco, com aviso ao iniciar; não recomendado).

### 2. Leve o palco para fora com um túnel (sem abrir porta no roteador)

- **Tailscale Serve** (rede privada, recomendado): `tailscale serve --bg 4321` e abra `https://<sua-maquina>.<tailnet>.ts.net` nas outras máquinas da sua tailnet.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:4321` (ou um túnel nomeado com o seu domínio).

Os dois chegam ao palco como `127.0.0.1`, por isso o token vale também para requisições locais. O limite de 300 POSTs a cada 10 s é por IP; atrás do túnel, todas as máquinas dividem o mesmo limite (folgado para poucas máquinas).

### 3. Envie os eventos de cada máquina

**Hooks permitidos, com Node (recomendado):** hook de comando apontando para o palco remoto.

```bash
node install-hooks.js --url https://<palco>/event --token <token>
```

**Hooks permitidos, sem Node:** hook HTTP do próprio Claude Code.

```bash
node install-hooks.js --http --url https://<palco>/event --token <token>
```

> O hook HTTP do Claude Code envia o payload completo do evento ao palco (o palco resume e descarta o resto na hora). Se o conteúdo não pode sair da máquina, prefira o hook de comando ou o relay, que resumem na origem. Se o palco recusar o envio (`401` token errado, `429` excesso de eventos), o Claude Code pode mostrar um aviso na sessão; ele nunca bloqueia a ação.

O token fica gravado no `settings.json` do Claude Code e aparece mascarado na saída do instalador. Se vazar, gere outro com `npm run token`.

**Hooks bloqueados (managed hooks only):** o relay lê os transcripts locais e envia só o resumo.

```bash
npm run relay -- --url https://<palco>/event --token <token> [--dir ~/.claude/projects] [--host nome-da-maquina]
```

Com o palco fora do ar, o relay guarda até 1.000 eventos e tenta de novo a cada 2 s; se o palco recusar o token, ele mostra "O palco recusou o token (401)" e para. Em Docker (servidor, VM de build), com os transcripts montados como somente leitura:

```bash
docker run --rm --no-healthcheck -e NIRVA_TOKEN \
  -v "$HOME/.claude/projects:/transcripts:ro" \
  ghcr.io/oscarcasagrande/nirva-stage:1.2.0 \
  node scripts/relay.js --dir /transcripts --url https://<palco>/event --host "$(hostname)"
```

### O que sai da máquina no envio remoto

Só o resumo: nome da ferramenta, nome do arquivo sem o caminho, primeira palavra do comando, host da URL, tipo do subagente, projeto e máquina. Padrões de busca, consultas, descrições de comandos, textos de notificação, prompts, conteúdo de arquivos e saídas **não** saem (no hook de comando e no relay, o resumo é feito na própria máquina).

Diagnóstico com token: `NIRVA_TOKEN=<token> npm run doctor`.

---

## 🎼 O que cada coisa significa

| No palco | Evento do Claude Code |
|---|---|
| Vocalista sobe ao palco | `SessionStart` |
| Vocalista canta | `UserPromptSubmit` |
| Toca leve, olhando a partitura (azul) | `Read`, `Grep`, `Glob` |
| Solo com notas voando (rosa) | `Edit`, `Write` |
| Headbang (laranja) | `Bash` |
| Web (verde) | `WebSearch`, `WebFetch` |
| Faíscas (roxo) | ferramentas `mcp__*` |
| Músico entra / sai | `SubagentStart` / `SubagentStop` |
| Mão levantada, luz âmbar piscando, *ding* | `PermissionRequest`, `Notification` |
| Reverência, confete, plateia, acorde | `Stop` (sua vez) |
| Faísca vermelha | `PostToolUseFailure` |
| Cochilando | 5 min sem eventos |

**Quem toca o quê:**

| Tipo de agente | Instrumentos preferidos |
|---|---|
| `Explore` | guitarra, violino, flauta |
| `Plan` e arquitetos | teclado, harpa, violoncelo |
| QA e review | baixo, violoncelo, trombone |
| dev e `general-purpose` | bateria, sax |
| quem escreve documentação | sanfona, clarinete |
| PM e analistas | trompete, tuba |

Se os preferidos estiverem ocupados, o agente pega qualquer instrumento livre. Sem lugar, espera na coxia.

**Containers:** a cor vem do projeto do Docker Compose (`com.docker.compose.project`, que por padrão é o nome da pasta). Se bater com a pasta de uma sessão do Claude, o amplificador pega a cor dela.
O LED fica verde rodando, amarelo com healthcheck iniciando, vermelho com `unhealthy`, âmbar reiniciando e azul pausado. Passe o mouse para ver os detalhes.

**Atalhos:** `S` som · `N` notificações · `L` registro · `D` demo · `C` tema · `F` tela cheia · `H` legenda · clique num projeto no topo para destacá-lo.

**Temas de cor 🎨:** o botão 🎨 (ou a tecla `C`, que passa para o próximo) troca na hora as cores do cenário: parede, letreiro, luzes, chão, LEDs e plateia. A banda continua tocando. As cores das atividades e dos projetos não mudam, porque carregam significado.

| Tema | Visual |
|---|---|
| Neon noturno (padrão) | Roxo com neon rosa e ciano |
| Synthwave | Laranja, magenta e chão quadriculado |
| Garagem grunge | Concreto, âmbar quente e ferrugem |
| Arena gelo | Azul-marinho, branco e gelo |
| Terminal hacker | Preto com verde fósforo |
| Clube de jazz | Vinho, dourado e creme |

A escolha fica lembrada no navegador. Para demo ou gravação de vídeo, force um tema pela URL com `?theme=<id>` (`neon`, `synthwave`, `grunge`, `ice`, `hacker` ou `jazz`), por exemplo `http://localhost:4321/?demo&theme=synthwave`. O tema da URL não substitui a escolha salva.

---

## 🔒 Segurança e privacidade

- O palco escuta só em `127.0.0.1` (no Docker, a porta é publicada só em `127.0.0.1` do host) e recusa (`401`) POSTs vindos de outras origens no navegador.
- Para usar de outras máquinas, ligue o token (`NIRVA_TOKEN`) e use um túnel: veja [Palco remoto](#-palco-remoto-v12). O token é comparado em tempo constante e nunca aparece no log.
- O palco só guarda e mostra um **resumo** do evento: nome do arquivo (sem o caminho), primeira palavra do comando (ou a descrição dele), host da URL e nome da ferramenta.
  No modo HTTP, o resumo é feito no servidor, assim que o evento chega, e o resto é descartado na hora.
- O `/event` sempre responde `200`, então o palco nunca bloqueia uma ação do Claude Code.
- Sem dependências npm. A única biblioteca externa é o gerador de QR Code (`public/vendor/qrcode.js`, MIT).

## ⚙️ Configuração

| Variável | Padrão | O que faz |
|---|---|---|
| `NIRVA_PORT` | `4321` | porta do palco (use a mesma ao instalar os hooks) |
| `NIRVA_HOST` | `127.0.0.1` (`0.0.0.0` na imagem Docker) | interface em que o servidor escuta |
| `NIRVA_DOCKER` | `1` | `0` desliga os amplificadores |
| `DOCKER_SOCK` | `/var/run/docker.sock` | socket do Docker no modo container |
| `NIRVA_TRANSCRIPTS` | desligado | `1` liga o modo transcript em `~/.claude/projects`; também aceita outro caminho |
| `NIRVA_DEBUG` | desligado | `1` mostra no log os tipos de linha lidos dos transcripts |
| `NIRVA_TOKEN` | vazio | liga a autenticação por token (v1.2) |
| `NIRVA_URL` | `http://127.0.0.1:4321/event` | destino do `hook.js` e do relay |
| `NIRVA_IN_DOCKER` | `1` na imagem Docker | permite escutar em `0.0.0.0` sem token dentro do contêiner |
| `NIRVA_INSECURE` | vazio | `1` permite expor o palco na rede sem token (não recomendado) |

O visual fica em `public/index.html`:

- `STATIONS`: posições do palco;
- `PREFER`: quem toca o quê;
- `ACT`: cores de cada atividade;
- `DONATE`: dados de doação (forks: coloquem os de vocês).

## ⚠️ Limitações

- Funciona com o Claude Code rodando **na sua máquina**: no terminal ou em sessões locais do app. Sessões na nuvem não alcançam o seu `localhost`.
- Quando o evento de ferramenta não traz `agent_id`, a ação aparece no vocalista em vez de no subagente.

## 📝 Changelog

### 1.3.0: Temas de cor

- Botão 🎨 com 6 temas de cor do palco: Neon noturno (padrão, igual ao visual anterior), Synthwave, Garagem grunge, Arena gelo, Terminal hacker e Clube de jazz.
- Tecla `C` para o próximo tema, com um aviso do nome; menu navegável só pelo teclado.
- A escolha fica salva no navegador; `?theme=<id>` força um tema ao abrir, sem gravar.
- Troca instantânea, sem perder a banda nem a conexão. Cores das atividades e dos projetos não mudam.

### 1.2.0: Palco remoto

- Autenticação por token (`NIRVA_TOKEN`): cabeçalho `Authorization: Bearer`, `?token=` ou cookie; página de login; `npm run token`.
- O palco se recusa a subir exposto na rede sem token (exceções: `NIRVA_IN_DOCKER=1`, `NIRVA_INSECURE=1`).
- Limite de 300 POSTs por IP a cada 10 s (com token).
- Recusa por `Origin` estranho agora responde `401` (antes `403`).
- Hooks remotos: `hook.js` e `install-hooks.js` com `--url` e `--token`, HTTPS e nome da máquina (`host`).
- Relay (`npm run relay`) para máquinas com hooks bloqueados, também em Docker.
- Rótulos `projeto @máquina` quando há mais de uma máquina no palco.
- `docker-compose.remote.yml` e `npm run doctor` com token.

---

## 💖 Apoie o projeto

Se o Nirva Stage deixou seus agentes mais divertidos, pague uma cerveja para a banda. 🍺

- **PIX (e-mail):** `oscar.casagrande@gmail.com`
- **PayPal:** [doar via PayPal](https://www.paypal.com/donate/?business=UT8UUZPYC426W&no_recurring=0&currency_code=BRL)
- ⭐ Dar uma estrela no repositório também ajuda muito.

O botão 💖 no canto do palco também mostra o QR Code do PIX.

## 🤝 Contribuindo

Issues e PRs são bem-vindos: novos instrumentos, cenários, temas, suporte a outros agentes (Codex, Cursor…).
Para testar localmente: `npm run serve` e depois `npm run test-event`. Algo não funciona? Rode `npm run doctor` (ou `npm run doctor -- --claude` para um teste real com o Claude Code).

## 📄 Licença

[MIT](LICENSE) © 2026 Oscar Casagrande, guitarrista da **Nirva Rock** 🤘

---

### English (short)

**Nirva Stage** turns your Claude Code agents into a pixel-art rock band in the browser.

- The main agent of each session sings at a mic, and subagents grab instruments.
- Running Docker containers become amps on the wall.
- Waiting-for-permission and turn-finished states are shown with lights, sound and confetti.

It is 100% local and only shows event summaries (file names, tool names), never file contents or prompts.

To run it, use `docker compose up -d` and install the HTTP hooks with `node install-hooks.js --http`. With Node.js, use `npm run install-hooks && npm start` instead.

MIT licensed.
