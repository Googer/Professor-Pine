# Professor Pine: the bot, its watchdog and its one-off commands (migrate, deploy-commands,
# restore, health), all from this one image. Built by `./pine up` (compose.yaml); see
# docs/architecture/operations.md.

# The compiled bot. `--ignore-scripts`: no dependency needs its install script for the build or
# the CPU (esbuild's, onnxruntime-node's CUDA download, protobufjs's, ssh2's), as in the
# checkout under npm 11's allow-scripts policy; the flag makes it so whatever npm the base has.
FROM node:26-slim AS build
WORKDIR /app
# The workspace's package.json before `npm ci`: the lock file names it.
COPY package.json package-lock.json ./
COPY packages/wayspot-core/package.json ./packages/wayspot-core/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY packages/wayspot-core/tsconfig.build.json ./packages/wayspot-core/
COPY packages/wayspot-core/src ./packages/wayspot-core/src
COPY src ./src
# `npm run build`: the package `@pine/wayspot-core`, the bot, then the web pages' bundle.
COPY scripts/web ./scripts/web
RUN npm run build

# The production dependencies, with the screen reader's runtime for this platform only.
FROM node:26-slim AS deps
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/wayspot-core/package.json ./packages/wayspot-core/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
# onnxruntime-node ships its library for every platform (about 290 MB); one is kept.
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) keep=x64 ;; \
      arm64) keep=arm64 ;; \
      *) echo "no screen reader runtime for ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    bin=node_modules/onnxruntime-node/bin/napi-v6; \
    test -d "$bin/linux/$keep"; \
    find "$bin" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +; \
    find "$bin/linux" -mindepth 1 -maxdepth 1 ! -name "$keep" -exec rm -rf {} +

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
# `package.json` says the compiled files are ES modules.
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The workspace package the link `node_modules/@pine/wayspot-core` points at: its package.json
# (its `exports`), its compiled files and its MIT notice, which goes with every copy.
COPY packages/wayspot-core/package.json packages/wayspot-core/LICENSE ./packages/wayspot-core/
COPY --from=build /app/packages/wayspot-core/dist ./packages/wayspot-core/dist
# The square raid egg pictures posts show (plan 8D-F) and the icons emoji-upload makes the
# buttons' emoji of (plan 8D-G), beside dist/ as in the checkout.
COPY pictures ./pictures
# The default settings; the stack mounts the installation's own over it.
COPY data/settings.json ./data/settings.json
# `var/` is a volume (game data cache, map pictures, the screen reader's models and screenshots,
# the health files): a new volume takes this folder's owner, so the bot can write to it.
RUN mkdir -p var && chown node:node var
USER node
# The bot shuts down cleanly on SIGTERM (src/index.ts); compose.yaml gives it the time.
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/index.js"]
