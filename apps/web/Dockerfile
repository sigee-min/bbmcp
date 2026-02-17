FROM node:22-alpine

WORKDIR /workspace

COPY . .

RUN npm install --no-audit --no-fund
RUN npm --workspace @ashfox/web run build

EXPOSE 8686

CMD ["npm", "--workspace", "@ashfox/web", "run", "start"]
