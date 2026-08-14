FROM node:22-bookworm-slim

WORKDIR /app

# ==========================================
# SYSTEM
# ==========================================

RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-pip \
        curl \
    && rm -rf /var/lib/apt/lists/*


# ==========================================
# PYTHON PACKAGES
# ==========================================

RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    uv \
    scratchattach


# ==========================================
# FIND UV AND CREATE SYSTEM LINK
# ==========================================

RUN UV="$(python3 -c 'import shutil; print(shutil.which("uv") or "")')" \
    && echo "Found uv at: $UV" \
    && test -n "$UV" \
    && ln -sf "$UV" /usr/local/bin/uv


# ==========================================
# TEST
# ==========================================

RUN /usr/local/bin/uv --version

RUN python3 -c \
    "import scratchattach; print('scratchattach OK')"


# ==========================================
# NODE
# ==========================================

COPY package*.json ./

RUN npm install


# ==========================================
# SOURCE
# ==========================================

COPY . .


# ==========================================
# PORT
# ==========================================

EXPOSE 10000


# ==========================================
# START
# ==========================================

CMD ["npm", "start"]
