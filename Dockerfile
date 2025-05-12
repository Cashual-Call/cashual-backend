# Use Node.js LTS as base image
FROM node:22-slim AS base

# Install OpenSSL
RUN apt update && apt upgrade openssl -y

# Install pnpm
RUN npm install -g pnpm@latest

# Set working directory
WORKDIR /app

# Install dependencies first for layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Install Prisma CLI
RUN pnpm add prisma --save-dev

# Copy application code
COPY . .

# Generate Prisma Client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Start the server
CMD ["pnpm", "start"]
