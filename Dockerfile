FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build frontend
RUN npm run build

EXPOSE 5000 3000

# Start the production Express server, which also serves the built frontend.
CMD ["node", "server/index.js"]
