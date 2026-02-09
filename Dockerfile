FROM nginx:1.25-alpine

ENV API_BACKEND_URL=https://api.mtginfo.org
ENV LEADERBOARD_SHEET_ID=15lRLvnGZCEnQrMAk7dDHRmMcobKFelYarlXns7KN7QQ
ENV LEADERBOARD_SHEET_GID=0

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
COPY leaderboard.html /usr/share/nginx/html/leaderboard.html
COPY api-status.html /usr/share/nginx/html/api-status.html
COPY rules.html /usr/share/nginx/html/rules.html
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80
