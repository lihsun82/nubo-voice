FROM alpine/git:2.47.2 AS upstream
ARG XIAOZHI_VERSION=v0.9.5
RUN git clone --depth 1 --branch "${XIAOZHI_VERSION}" https://github.com/xinnan-tech/xiaozhi-esp32-server.git /src

FROM ghcr.io/xinnan-tech/xiaozhi-esp32-server:server-base
USER root
RUN apt-get update && apt-get install -y --no-install-recommends nginx gettext-base curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/xiaozhi-esp32-server
COPY --from=upstream /src/main/xiaozhi-server/ ./
COPY --from=upstream /src/main/digital-human/ /srv/xiaozhi-h5/
COPY --from=upstream /src/LICENSE /licenses/xiaozhi-esp32-server-LICENSE
COPY deploy/xiaozhi-standalone/entrypoint.sh /usr/local/bin/nubo-xiaozhi-entrypoint
COPY deploy/xiaozhi-standalone/nginx.conf.template /etc/nginx/templates/nubo-xiaozhi.conf.template
COPY deploy/xiaozhi-standalone/nubo-bootstrap.js /srv/xiaozhi-h5/js/nubo-bootstrap.js
COPY deploy/xiaozhi-standalone/gemini_asr.py ./core/providers/asr/gemini_asr.py

RUN chmod +x /usr/local/bin/nubo-xiaozhi-entrypoint \
    && sed -i '/<script type="module" src="js\/app.js/i\    <script src="js/nubo-bootstrap.js"></script>' /srv/xiaozhi-h5/index.html \
    && sed -i '/js\/live2d\//d; /live2dcubismcore/d; /cubism4.min.js/d; /pixi.js/d' /srv/xiaozhi-h5/index.html \
    && rm -rf /srv/xiaozhi-h5/js/live2d /srv/xiaozhi-h5/resources \
    && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/nubo-xiaozhi-entrypoint"]
