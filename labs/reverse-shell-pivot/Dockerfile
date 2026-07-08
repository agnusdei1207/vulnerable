FROM node:20-alpine

RUN apk update && apk add sudo bash findutils curl python3
RUN adduser -D ctfuser
RUN echo "ctfuser ALL=(ALL) NOPASSWD: /usr/bin/find" >> /etc/sudoers

WORKDIR /lab

COPY edge-server.js pivot-relay.js pivot-entry.sh ./
RUN chmod +x /lab/pivot-entry.sh

RUN chown -R ctfuser:ctfuser /lab

USER ctfuser

EXPOSE 3000 8081
