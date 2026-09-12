FROM node:20-alpine

WORKDIR /app

# Copy package files + the Prisma schema (npm install triggers "prisma generate"
# on postinstall, which needs prisma/schema.prisma to work).
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build frontend
RUN npm run build

EXPOSE 5000 3000

# Applies pending migrations (DATABASE_URL is only known at container
# startup, not at build time) then starts the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
