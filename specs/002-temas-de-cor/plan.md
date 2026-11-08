# Implementation Plan: Temas de cor do palco (v1.3)

**Branch**: `spec-kit-setup` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-temas-de-cor/spec.md`

## Summary

Mudança concentrada em `public/index.html`, sem dependências e sem arquivos estáticos novos. Os
literais de cor do cenário viram chaves de um objeto `theme`, seguindo a tabela "Mapeamento para
o código atual" do PRD. `drawBG()` e `drawSign()` passam a ser reexecutáveis; `applyTheme(id)`
troca o tema e redesenha `bg` e `sign` sem tocar em `sessions`, `members`, `particles` nem na
conexão SSE. Menu acessível no `#ctrl`, atalho `C`, persistência com o `store` existente e
`?theme=` na URL. Testes: `node:test` para o T11 (THEMES × JSON) e para a remoção dos literais, e
um script Playwright (fora do `package.json`) que valida T01–T10 e tira um screenshot de cada tema
com `?demo&theme=<id>`. Decisões: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript no navegador (script inline em `public/index.html`); Node 18+ para
os testes

**Primary Dependencies**: nenhuma em runtime. Playwright 1.49 só como ferramenta de validação,
instalado fora do repositório (scratch) ou com `npm i --no-save`

**Storage**: `localStorage` via `store` existente (`nirva:theme`)

**Testing**: `node:test` (T11 e estático) + script Playwright `test/e2e/temas.e2e.js` (T01–T10)

**Target Platform**: navegadores modernos (Chrome, Edge, Firefox, Safari); página servida pelo
palco, aberta como arquivo ou publicada

**Project Type**: página web estática (canvas 640×360 em pixel art) servida pelo palco

**Performance Goals**: troca de tema < 50 ms (um redesenho do `bg` 640×360 e do `sign`); zero
custo extra por quadro

**Constraints**: Neon pixel a pixel igual à v1.2; `ACT` e `SESSION_COLORS` intocados; sem arquivos
novos em `public/`; constituição I (zero dependências) e VII (português)

**Scale/Scope**: 6 temas × 36 chaves; ~1 arquivo de produto, 2 de teste, README

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Verificação | Pré | Pós |
| --- | --- | --- | --- |
| I. Zero dependências | Nada no `package.json`; Playwright fora dele; `no-deps.test.js` continua verde | ✅ | ✅ |
| II. Privacidade | Não toca eventos nem rede | ✅ | ✅ |
| III. Nunca atrapalhar | Não toca hooks nem `/event` | ✅ | ✅ |
| IV. Seguro por padrão | Nenhuma rota nova; lista fechada do `server.js` intacta | ✅ | ✅ |
| V. Compatibilidade | Neon idêntico à v1.2 (T01 por hash de pixels); `v11-compat` verde | ✅ | ✅ |
| VI. Testes antes | T11 e teste estático escritos antes; e2e T01–T10 automatizado | ⚠️ | ✅ (ver Complexity Tracking) |
| VII. Português | Menu, aviso, legenda e README em português | ✅ | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/002-temas-de-cor/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
public/index.html            # THEMES, theme, applyTheme, drawBG/drawSign reexecutáveis, menu, C, ?theme=
README.md                    # seção do palco e atalhos (C, 🎨)
test/themes.test.js          # T11 (THEMES = JSON) e remoção dos literais (RF02)
test/e2e/temas.e2e.js        # Playwright: T01–T10, screenshots em docs/temas/<id>.png
docs/temas/<id>.png          # 6 screenshots (documentação, não servidos pelo palco)
```

**Structure Decision**: tudo do produto fica em `public/index.html` (PRD, "Código"). O e2e fica
em `test/e2e/` com nome que não casa `*.test.js`, para não rodar no `npm test` (depende de
navegador) e não entrar no `no-deps.test.js` (que varre só código de runtime).

## Complexity Tracking

| Violação | Por que existe | Alternativa rejeitada porque |
| --- | --- | --- |
| Princípio VI: T01–T10 rodam por script Playwright, fora do `npm test`/CI | Exigem navegador real; o CI atual não tem navegador e o Playwright não pode virar dependência | Simular o canvas em Node exigiria dependência (canvas) ou reescrever o desenho; o T11 e o teste estático rodam no CI |
