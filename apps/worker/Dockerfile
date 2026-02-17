ARG ASHFOX_WORKSPACE_DEPS_IMAGE=ashfox/workspace-deps:local
FROM ${ASHFOX_WORKSPACE_DEPS_IMAGE}

WORKDIR /workspace

COPY . .

CMD ["npm", "--workspace", "@ashfox/worker", "run", "start"]
