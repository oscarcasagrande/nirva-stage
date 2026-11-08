# Constituição do Nirva Stage

O Nirva Stage é um visualizador local dos agentes do Claude Code. Os princípios abaixo são
inegociáveis e valem para todo código, documentação e funcionalidade do projeto.

## Core Principles

### I. Zero Dependências em Runtime

- O código executado em runtime (servidor, hooks, instalador, relay e scripts) MUST usar apenas
  módulos nativos do Node.js 18 ou superior.
- `package.json` MUST NOT declarar `dependencies`. A única exceção de código de terceiros é
  `public/vendor/qrcode.js`, versionado no repositório.
- Ferramentas de desenvolvimento, se existirem, MUST NOT ser exigidas para rodar o produto.

**Justificativa**: instalação instantânea, superfície de ataque mínima e funcionamento em
estações corporativas com acesso restrito ao registro npm.

### II. Privacidade do Evento

- Só o resumo do evento MAY sair da máquina de origem: nome da ferramenta, nome do arquivo sem
  caminho, primeira palavra do comando e host da URL (além de metadados de sessão necessários à
  exibição, como projeto e máquina).
- Conteúdo de arquivos, prompts, saídas de ferramentas, argumentos completos de comandos, caminhos
  completos e URLs completas MUST NOT ser transmitidos, registrados ou exibidos fora da origem.
- A normalização para o resumo MUST acontecer na máquina de origem, antes de qualquer envio.

**Justificativa**: o palco pode rodar em outra máquina ou atrás de um túnel; o que não sai da
origem não pode vazar.

### III. Nunca Atrapalhar o Claude Code

- Todo hook MUST sair com código 0 em até 1,5 s, inclusive quando o servidor estiver fora do ar,
  lento, inacessível ou rejeitar a requisição.
- Falhas do hook MUST ser silenciosas para o Claude Code (sem saída que altere seu comportamento).
- `POST /event` MUST NOT responder `403`, para não ser interpretado como bloqueio de ação.

**Justificativa**: o Nirva Stage é um espectador; nunca pode atrasar, bloquear ou quebrar a
sessão de quem o usa.

### IV. Seguro por Padrão

- O servidor MUST escutar em `127.0.0.1` por padrão.
- Escutar em qualquer outra interface MUST exigir `NIRVA_TOKEN` definido; sem token, o servidor
  MUST recusar a exposição em rede e explicar o motivo ao usuário.
- Exceções explícitas, sempre opt-in: `NIRVA_IN_DOCKER=1` (o contêiner escuta em todas as
  interfaces, mas a porta é publicada só em 127.0.0.1 do host) e `NIRVA_INSECURE=1` (exposição sem
  token por escolha consciente do usuário, com aviso em português ao iniciar).
- Tokens MUST NOT aparecer em logs nem em saídas de terminal sem mascaramento.

**Justificativa**: ninguém deve expor seus agentes à rede por acidente.

### V. Compatibilidade com a v1.1

- Sem `NIRVA_TOKEN` definido, o comportamento observável da v1.1 (rotas, respostas, hooks,
  modo transcript, comandos `npm run`) MUST permanecer inalterado.
- Toda mudança que afete esse comportamento MUST ser tratada como quebra de compatibilidade e
  exige emenda a esta constituição.
- Exceções aprovadas na v1.2: (a) acréscimos que não mudam o que o usuário de uma só máquina vê
  (campo `host` nos eventos, leitura de `?host=`, rótulos `projeto @máquina` só com mais de uma
  máquina); (b) a recusa por `Origin` em `POST /event` passa de `403` para `401`, para cumprir o
  Princípio III; (c) `NIRVA_HOST` fora do loopback sem token passa a exigir `NIRVA_INSECURE=1`
  (Princípio IV).

**Justificativa**: quem já usa o palco localmente não deve precisar reconfigurar nada ao
atualizar.

### VI. Testes Antes do Código (INEGOCIÁVEL)

- Testes MUST ser escritos e vistos falhando antes da implementação (Red-Green-Refactor).
- Todo requisito (funcional ou não funcional, incluindo os princípios II a V) MUST ter ao menos um
  teste automatizado rastreável ao seu ID.
- Os testes MUST rodar em CI no Ubuntu com Node 22, usando `node:test` e módulos nativos, coerente
  com o Princípio I.

**Justificativa**: os princípios só são inegociáveis se forem verificados a cada mudança.

### VII. Português em Primeiro Lugar

- Documentação (README, docs, specs, planos) e todas as mensagens ao usuário (terminal, páginas
  web, erros) MUST estar em português.
- Identificadores de código, nomes de variáveis de ambiente e protocolos MAY permanecer em inglês.

**Justificativa**: o público principal do projeto é lusófono.

## Restrições Técnicas

- Runtime: Node.js >= 18 (campo `engines` do `package.json`); CI de referência: Ubuntu + Node 22.
- Estado em memória (sem banco de dados), salvo emenda explícita.
- Acesso remoto por túneis (ex.: Tailscale Serve, Cloudflare Tunnel); o projeto MUST NOT exigir
  abertura de portas no roteador.
- Funcionalidades que enviam dados para fora da máquina (ex.: relay) MUST ser desligadas por
  padrão e documentar no README exatamente o que é enviado.

## Fluxo de Desenvolvimento e Portões de Qualidade

- Cada funcionalidade segue o fluxo Spec Kit: especificação → plano → tarefas → implementação.
- O plano de cada funcionalidade MUST incluir uma verificação explícita contra os sete princípios
  ("Constitution Check"); violações MUST ser justificadas ou eliminadas antes da implementação.
- Um PR só pode ser integrado com o CI verde e com testes cobrindo todos os requisitos alterados.
- Revisões MUST verificar especialmente: novas dependências (I), campos enviados nos eventos (II),
  códigos de saída e tempos dos hooks (III), interface de escuta e tokens (IV) e comportamento sem
  `NIRVA_TOKEN` (V).

## Governance

- Esta constituição prevalece sobre qualquer outra prática, guia ou especificação do projeto.
- Emendas MUST ser feitas por PR que altere este arquivo, descreva o motivo e o impacto, e
  atualize testes e documentação afetados.
- Versionamento semântico da constituição:
  - MAJOR: remoção ou redefinição incompatível de um princípio.
  - MINOR: novo princípio ou seção, ou ampliação material de orientação.
  - PATCH: esclarecimentos, redação e correções sem efeito semântico.
- A conformidade é revisada em cada PR e em cada execução de `/speckit-plan` e `/speckit-analyze`.

**Version**: 1.1.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
