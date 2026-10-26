# Pinned by digest: a tag can move, and the whole point of this container is that
# the caller can name the exact bytes that produced their answer.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app

# Dependencies first so a code change does not reinstall the tree.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

# The dstack socket is mounted by the compose file, not created here.
EXPOSE 8080

USER node
CMD ["node", "server.mjs"]
