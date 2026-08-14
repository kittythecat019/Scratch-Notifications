FROM node:22-bookworm-slim

WORKDIR /app

# Python + curl
RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-pip \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Cài uv
RUN pip3 install --break-system-packages uv

# Kiểm tra uv
RUN which uv
RUN uv --version

# Node dependencies
COPY package*.json ./

RUN npm install

# Python dependencies
COPY requirements.txt ./

RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    -r requirements.txt

# Kiểm tra scratchattach ngay lúc BUILD
RUN python3 -c "import scratchattach; print('scratchattach OK')"

# Source
COPY . .

EXPOSE 10000

CMD ["npm", "start"]
