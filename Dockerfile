# Use Bun official image as base
FROM oven/bun:1 AS base

# Install OpenSSL (if not already present, for Prisma and others)
USER root
RUN apt update && apt install -y openssl && apt clean

# Set working directory
WORKDIR /app

# Install dependencies first for layer caching
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Install Prisma CLI (devDependency)
RUN bun add prisma@latest --dev

# Copy application code
COPY . .

# Generate Prisma Client
RUN bunx prisma generate

# Build the application (assumes 'build' script in package.json)
RUN bun run build

# Start the server (uses the same script as before)
CMD ["bun", "run", "start"]
