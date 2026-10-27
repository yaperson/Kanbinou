# =============================================================================
# Kanbinou - Image Docker de Production Optimisée
# =============================================================================

# Étape 1 : Construction de l'interface front-end (Vite)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Installation des dépendances avec cache
COPY package*.json ./
RUN npm ci

# Copie des sources et compilation de l'interface Vue 3
COPY . .
RUN npm run build

# Étape 2 : Image d'exécution finale légère
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Installation exclusive des dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev

# Copie du serveur backend et des assets compilés
COPY server.js ./
COPY --from=builder /app/dist ./dist
COPY public ./public

# Dossier persistant pour stocker kanbinou.sqlite et les secrets JWT
RUN mkdir -p /data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.js"]
