FROM node:20-alpine

# Install sudo and bash for privesc
RUN apk update && apk add sudo bash findutils

# Create non-root user
RUN adduser -D ctfuser

# Configure sudo for ctfuser (GTFOBins privesc via find)
RUN echo "ctfuser ALL=(ALL) NOPASSWD: /usr/bin/find" >> /etc/sudoers

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads public views downloads
RUN chown -R ctfuser:ctfuser /app

# Secure the privesc flag specifically so only root can read it!
RUN chown root:root /app/flags/flag_privesc.txt && chmod 400 /app/flags/flag_privesc.txt

# Switch to non-root user
USER ctfuser

EXPOSE 3000

CMD ["npm", "start"]
