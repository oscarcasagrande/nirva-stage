# Nirva Stage: imagem pequena, sem dependências além do Node.
FROM node:22-alpine

LABEL org.opencontainers.image.title="Nirva Stage" \
      org.opencontainers.image.description="Seus agentes do Claude Code como uma banda de rock em pixel art" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    NIRVA_HOST=0.0.0.0 \
    NIRVA_PORT=4321

WORKDIR /app
COPY --chown=node:node package.json server.js hook.js install-hooks.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.NIRVA_PORT||4321)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
