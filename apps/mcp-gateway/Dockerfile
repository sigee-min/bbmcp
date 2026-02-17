FROM node:22-alpine

WORKDIR /workspace

COPY . .

RUN npm install --no-audit --no-fund

CMD ["npm", "--workspace", "@ashfox/mcp-gateway", "run", "start"]
