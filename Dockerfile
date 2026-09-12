# Use lightweight Node.js 22 LTS on Alpine Linux (includes built-in node:sqlite)
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure data directory exists for SQLite database persistence
RUN mkdir -p /app/data

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
