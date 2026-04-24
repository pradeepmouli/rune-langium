# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: FSL-1.1-ALv2
# Copyright (c) 2026 Pradeep Mouli
#
# Hosted codegen container for feature 011-export-code-cf.
#
# Two-stage build:
#   Stage 1 (builder) compiles CodegenCli.java against the rosetta-code-generators
#   classpath, producing a launcher script + class dir.
#   Stage 2 (runtime) carries just the JRE, JARs, launcher, and Node HTTP wrapper.
#
# The pinned commit of rosetta-code-generators MUST be bumped deliberately.
# See apps/codegen-container/README.md for the update procedure.

ARG ROSETTA_REPO=https://github.com/REGnosys/rosetta-code-generators.git
# TODO(011): replace with a verified upstream tag or commit SHA before first deploy.
# 'main' is a moving target and breaks reproducibility.
ARG ROSETTA_COMMIT=main

# ---------- Stage 1: builder ----------
FROM eclipse-temurin:21-jdk AS builder

# Maven + git are needed to clone + build rosetta-code-generators.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      maven \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG ROSETTA_REPO
ARG ROSETTA_COMMIT
ENV ROSETTA_REPO=${ROSETTA_REPO} \
    ROSETTA_COMMIT=${ROSETTA_COMMIT}

WORKDIR /build

RUN git clone --filter=blob:none "${ROSETTA_REPO}" rosetta-code-generators \
    && cd rosetta-code-generators \
    && git checkout "${ROSETTA_COMMIT}" \
    && mvn package -DskipTests -pl default-cdm-generators -am -q

# Copy the existing CodegenCli.java source from the monorepo.
# Build context is expected to be the repo root (docker build -f apps/codegen-container/Dockerfile .)
COPY packages/codegen/server/src /build/codegen-src/src

# Resolve Maven classpath and compile CodegenCli.java against it.
# Writes target/classes and target/codegen-cli.sh launcher that uses in-container paths.
# BuildKit heredoc form (`RUN <<EOF`) is used so the inner shell heredoc for
# the launcher script nests cleanly without Dockerfile-parser confusion.
RUN <<STAGE1_SH
set -eux
cd rosetta-code-generators
CLASSPATH=$(mvn dependency:build-classpath -pl default-cdm-generators -q \
            -DincludeScope=compile \
            -Dmdep.outputFile=/dev/stdout 2>/dev/null)
CDM_JAR="/build/rosetta-code-generators/default-cdm-generators/target/default-cdm-generators-0.0.0.main-SNAPSHOT.jar"
CLASSPATH="${CDM_JAR}:${CLASSPATH}"
mkdir -p /build/codegen-src/target/classes
javac -cp "$CLASSPATH" \
      -d /build/codegen-src/target/classes \
      --add-exports jdk.httpserver/com.sun.net.httpserver=ALL-UNNAMED \
      /build/codegen-src/src/org/isda/cdm/generators/CodegenCli.java
cat > /build/codegen-src/target/codegen-cli.sh <<LAUNCHER
#!/usr/bin/env bash
exec java -cp "/app/codegen-cli/classes:${CLASSPATH}" \
     org.isda.cdm.generators.CodegenCli "\$@"
LAUNCHER
chmod +x /build/codegen-src/target/codegen-cli.sh
STAGE1_SH

# ---------- Stage 2: runtime ----------
FROM eclipse-temurin:21-jre-jammy AS runtime

# Install Node 20 for the HTTP wrapper.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled CLI launcher + classes + full Maven-resolved classpath jars.
# We take the whole rosetta-code-generators target/ tree because the launcher references
# absolute classpath entries that point into those JARs.
COPY --from=builder /build/codegen-src/target/codegen-cli.sh /app/codegen-cli/codegen-cli.sh
COPY --from=builder /build/codegen-src/target/classes        /app/codegen-cli/classes
COPY --from=builder /build/rosetta-code-generators           /build/rosetta-code-generators

# Copy the pre-compiled Node HTTP wrapper (produced by `pnpm --filter @rune-langium/codegen-container build:ts`).
# Expected at dist/server.js with any helper modules it imports.
COPY apps/codegen-container/dist /app/dist

ENV PORT=8080 \
    CODEGEN_CLI=/app/codegen-cli/codegen-cli.sh \
    NODE_ENV=production

EXPOSE 8080

ENTRYPOINT ["node", "/app/dist/server.js"]
