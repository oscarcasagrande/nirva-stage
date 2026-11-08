# Contrato de interface: seletor de tema

## Elementos

| Elemento | Atributos |
| --- | --- |
| `#bTheme` (botão no `#ctrl`, antes do `#bSound`) | texto `🎨`, `title="Tema do palco (C)"`, `aria-haspopup="menu"`, `aria-expanded` |
| `#themeMenu.panel` | `role="menu"`, `aria-label="Tema do palco"`, oculto por padrão |
| item do menu | `button[role="menuitemradio"][data-theme=<id>]`, `aria-checked="true|false"`, contém `canvas` 64×36, nome e tagline |
| `#themeToast.panel` | `role="status"`, `aria-live="polite"`, texto `🎨 <nome>`, visível 1,5 s |

## Teclado

| Contexto | Tecla | Efeito |
| --- | --- | --- |
| global (sem Ctrl/Cmd/Alt) | `C` | próximo tema (com volta), salva, mostra o aviso |
| botão 🎨 focado | `Enter`/espaço | abre o menu com foco no tema ativo |
| menu | ↑/↓, Home/End | move o foco (com volta) |
| menu | `Enter`/espaço | aplica o tema focado, salva e fecha |
| menu | `Esc` | fecha sem mudar e devolve o foco ao 🎨 |
| fora do menu | clique | fecha |

## URL e armazenamento

- `?theme=<id>`: aplica ao abrir, sem gravar. Combina com `?demo`.
- `localStorage['nirva:theme']`: JSON com o id (via `store`).

## Ganchos de teste (somente leitura)

- `document.documentElement.dataset.theme` = id do tema ativo.
