FROM ghcr.io/foundry-rs/foundry:latest

USER root
ENV FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Create workspace directory
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Pre-initialize a forge project so dependencies are cached
RUN forge init --no-git /workspace/template && \
    cd /workspace/template && \
    forge build

# Keep the template for fast project scaffolding
# Each scan copies from /workspace/template to /workspace/scan

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["sleep infinity"]
