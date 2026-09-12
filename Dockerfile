FROM node:20-alpine

WORKDIR /app

# Copy package files + le schéma Prisma (npm install déclenche "prisma generate"
# en postinstall, qui a besoin de prisma/schema.prisma pour fonctionner).
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build frontend
RUN npm run build

EXPOSE 5000 3000

# Applique les migrations en attente (DATABASE_URL n'est connue qu'au
# démarrage du conteneur, pas au build) puis démarre le serveur.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
