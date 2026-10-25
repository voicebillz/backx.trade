# Same pinned Node.js as the API (bump on every Node.js security release). Non-root. No secrets in the image:
# KEEPER_KEY / REPORT_KEY come from the host's secret settings at run time.
FROM public.ecr.aws/docker/library/node:24.22.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
# One container per server runs every keeper in KEEPER_SET (src/setup.js); a single keeper still works with
# `node src/index.js` and the per-keeper env.
CMD ["node", "src/multi.js"]
