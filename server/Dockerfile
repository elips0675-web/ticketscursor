FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# prisma CLI в devDeps: устанавливаем всё (npm ci), генерируем клиент,
# затем вычищаем devDeps (npm prune). Иначе npx prisma generate не найдёт CLI.
RUN npm ci && npx prisma generate && npm prune --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/knexfile.js ./
COPY --from=build /app/prisma ./prisma
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
