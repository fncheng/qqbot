FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
COPY drizzle ./drizzle
COPY tsconfig.json ./
EXPOSE 3000
CMD ["pnpm", "start"]
