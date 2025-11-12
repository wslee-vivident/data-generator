# Use official Node.js LTS image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./
RUN npm install

# Install dependencies
RUN npm ci

# Copy Prompts and other necessary files
COPY server/prompts/ /app/dist/prompts/

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose application port (change if needed)
ENV PORT=8080

# Start the application
CMD ["node", "lib/index.js"]