# Modelo de dados: Temas de cor (v1.3)

## Tema

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | texto | um de `neon`, `synthwave`, `grunge`, `ice`, `hacker`, `jazz` (ordem do JSON) |
| `name` | texto | nome exibido no menu e no aviso |
| `tagline` | texto | descrição curta no menu |
| 32 chaves hex | texto `#rrggbb` | `pageBg`, `wallBase`, `foamA`, `foamB`, `foamHiA`, `foamHiB`, `foamLine`, `sideWall`, `brick`, `shelf`, `baseboard`, `floorA`, `floorB`, `floorLine`, `riserTop`, `riserLine`, `riserFace`, `riserEdge`, `stageEdge`, `stageEdgeHi`, `pit`, `truss`, `trussZig`, `cable`, `signBg`, `signA`, `signB`, `ledRiserOn`, `ledRiserOff`, `ledEdgeOn`, `ledEdgeOff`, `crowdRim` |
| `washA`, `washB`, `overlay` | texto `R,G,B` | entram em `rgba(...)`; o alpha vem do código |
| `crowd` | 4 × hex | cor da silhueta `i` = `crowd[i % 4]` |
| `floorGrid` | booleano opcional | `true` só no `synthwave` |

Fonte da verdade: `docs/temas-de-cor.json`; cópia idêntica em `THEMES` (T11).

## Escolha de tema

| Origem | Prioridade | Grava? |
| --- | --- | --- |
| `?theme=<id>` ao abrir | 1 | não |
| `localStorage` `nirva:theme` | 2 | — |
| padrão `neon` | 3 | — |
| menu ou tecla `C` | ação do usuário | sim |

Id desconhecido em qualquer origem → `neon`.
