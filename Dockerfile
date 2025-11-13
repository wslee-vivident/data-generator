# Use official Node.js LTS image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build
RUN npm run copy

# Expose application port (change if needed)
ENV PORT=8080

# Start the application
CMD ["node", "dist/server/index.js"]