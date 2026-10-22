FROM postgres:17.10-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193

# pgvector v0.8.7, pinned to its commit and source archive checksum.
RUN apk add --no-cache --virtual .vector-build build-base clang llvm-dev curl \
    && curl -fsSL https://github.com/pgvector/pgvector/archive/f37c13f68b57d2c3472b2214fbcff699d6d34876.tar.gz -o /tmp/vector.tar.gz \
    && echo '83d673c3b287cddbf3879f86215f043f2c2b56c69d37b2a77504910db1ed6e56  /tmp/vector.tar.gz' | sha256sum -c - \
    && mkdir /tmp/vector \
    && tar -xzf /tmp/vector.tar.gz -C /tmp/vector --strip-components=1 \
    && make -C /tmp/vector OPTFLAGS='' with_llvm=no \
    && make -C /tmp/vector install with_llvm=no \
    && rm -rf /tmp/vector /tmp/vector.tar.gz \
    && apk del .vector-build
