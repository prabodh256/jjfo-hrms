# Multi-stage: build frontend, run API that can serve static build via reverse proxy.
# For simple demos, prefer docker-compose (api + web separately).

FROM node:22-alpine AS web-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web-build /app/frontend/dist ./public
RUN npx prisma generate
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && node server.js"]
