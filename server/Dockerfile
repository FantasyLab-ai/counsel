# Counsel backend — Flask over the Aurora engine adapter.
# The heavy scientific stack comes from Aurora's requirements; the Aurora
# repo is vendored in at build time (build from a checkout that has both
# repos side by side, or adjust the COPY).
#
#   docker build -t counsel-backend -f server/Dockerfile .
#   docker run -p 8100:8100 counsel-backend
#
# Hosting targets that run this as-is: Fly.io, Railway, Render, any VPS.
FROM python:3.12-slim

WORKDIR /app

# Aurora engine (the math). AURORA_REPO must contain fantasyai/ + requirements.
# Simplest layout: clone https://github.com/FantasyLab-ai/aurora into ./aurora
# next to this repo before building.
COPY aurora/ /opt/aurora/
RUN pip install --no-cache-dir -r /opt/aurora/requirements.txt flask flask-cors gunicorn

COPY server/ /app/
ENV AURORA_REPO=/opt/aurora \
    COUNSEL_PORT=8100

EXPOSE 8100
CMD ["gunicorn", "-b", "0.0.0.0:8100", "-w", "2", "--timeout", "120", "server:app"]
