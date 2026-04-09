# ---- Build stage ----
# Use Node 20 LTS as the base — it has native FormData and fetch built in,
# which we use for the Azure multipart upload (no extra polyfills needed)
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first so this layer is cached (only bust on dep changes)
COPY package.json tsconfig.json ./

# Install ALL deps (including devDeps for tsc)
RUN npm install

# Copy source and compile TypeScript → JavaScript
COPY src/ ./src/
RUN npm run build


# ---- Production stage ----
# Start fresh to keep the final image small — only copy compiled JS and prod deps
FROM node:20-slim AS runner

# Install ffmpeg (for audio splitting) and ffprobe (bundled with ffmpeg)
# --no-install-recommends keeps the image lean
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only what's needed to run the service
COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Render sets PORT automatically; default to 8080 if running locally
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
