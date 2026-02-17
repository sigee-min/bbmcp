ARG ASHFOX_WORKSPACE_DEPS_IMAGE=ashfox/workspace-deps:local
FROM ${ASHFOX_WORKSPACE_DEPS_IMAGE}

WORKDIR /workspace

COPY . .

RUN npm --workspace @ashfox/web run build

EXPOSE 8686

CMD ["npm", "--workspace", "@ashfox/web", "run", "start"]
