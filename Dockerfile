FROM nginx:1.25-alpine

ENV API_BACKEND_URL=https://api.mtginfo.org
ENV LEADERBOARD_SHEET_ID=15lRLvnGZCEnQrMAk7dDHRmMcobKFelYarlXns7KN7QQ

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
