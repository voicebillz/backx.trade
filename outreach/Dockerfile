# backx-outreach worker (docs/backx/OUTREACH-AGENT-PLAN.md). Railway service with NO public domain.
# Same pinned Node.js as the API (bump on every Node.js security release), from AWS ECR Public (no Docker Hub limits).
FROM public.ecr.aws/docker/library/node:24.22.1-bookworm-slim

ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --fetch-retries=5 --fetch-retry-mintimeout=5000 && npm cache clean --force
# Chromium + its system libraries for the form filler (same version as the playwright package).
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/* && chown -R node:node /ms-playwright

COPY src ./src

# Never run as root.
USER node
CMD ["node", "src/index.js"]
