FROM node:22-bookworm-slim

WORKDIR /app

# Python + pip + curl
RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-pip \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Cài uv và scratchattach
RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    uv \
    scratchattach

# Kiểm tra Python
RUN python3 --version

# Kiểm tra scratchattach
RUN python3 -c "import scratchattach; print('scratchattach OK')"

# Kiểm tra uv
RUN python3 -m uv --version

# Lấy đường dẫn uv
RUN python3 -c "import shutil; print('UV PATH:', shutil.which('uv'))"

# Node dependencies
COPY package*.json ./

RUN npm install

# Source code
COPY . .

EXPOSE 10000

CMD ["npm", "start"]
