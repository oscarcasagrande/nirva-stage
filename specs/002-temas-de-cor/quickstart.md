# Quickstart de validação: Temas de cor (v1.3)

## 1. Testes automatizados de Node

```bash
npm test          # inclui test/themes.test.js (T11 e literais removidos)
```

## 2. e2e com navegador (T01–T10) e screenshots

Pré-requisito: Chrome instalado e Playwright disponível fora do `package.json`:

```bash
npm i --no-save playwright@1.49.1        # ou aponte NODE_PATH para uma instalação existente
node test/e2e/temas.e2e.js               # sobe o palco numa porta livre
```

Esperado: T01–T10 "ok", zero erros de console e `docs/temas/<id>.png` para os 6 temas.

| Teste | Como o e2e verifica |
| --- | --- |
| T01 | hash do quadro determinístico = `2ff1a33d` (v1.2) sem tema salvo e com `?theme=neon` |
| T02 | para cada tema do menu: hash do quadro muda e `data-theme` = id; cores de `ACT` no CSS da legenda iguais |
| T03 | escolhe `jazz`, recarrega, `data-theme` = `jazz` |
| T04 | `?theme=hacker` → `hacker`, `localStorage` inalterado |
| T05 | `?theme=xyz` e `nirva:theme` = `{quebrado` → `neon`, sem erro |
| T06 | `C` × 6 → percorre os 6 e volta; aviso com o nome visível |
| T07 | demo tocando: nº de músicos e sessões igual antes/depois de trocar; conexão "demo"/"ao vivo" mantida |
| T08 | só teclado: Tab até 🎨, Enter, ↓, Enter aplica; reabre, Esc fecha |
| T09 | synthwave: pixel do chão numa linha de grade = `floorLine`, fora dela = `floorA` |
| T10 | página aberta como `file://` (sem servidor): menu e `C` funcionam no demo |

## 3. Manual rápido

`npm run serve` e abrir `http://localhost:4321/?demo&theme=synthwave`; apertar `C`; abrir 🎨.
