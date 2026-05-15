FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY dist/ ./dist/
COPY db/migrations/ ./db/migrations/
RUN mkdir -p data logs
EXPOSE 3399
CMD ["node", "dist/server/index.js"]
