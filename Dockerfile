FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY .env .env
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/prisma ./prisma
COPY .env .env
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
