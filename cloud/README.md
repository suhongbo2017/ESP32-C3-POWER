# Cloud Infrastructure

This directory contains the first infrastructure slice for the cloud backend:
PostgreSQL and Mosquitto in an isolated Docker Compose project.

## Current status

The files are a deployment skeleton. Do not expose or start Mosquitto publicly until:

- a DNS name is assigned for MQTT;
- a trusted TLS certificate is available;
- broker password and ACL files are generated;
- the cloud application is added to the Compose project;
- the server firewall and Nginx route are reviewed.

The current broker listener is intentionally only exposed inside the Docker network.
It is not published on the Ubuntu host.

## Local validation

```bash
cp .env.example .env
# edit .env and replace POSTGRES_PASSWORD
mkdir -p mosquitto/data mosquitto/log
# Generate mosquitto/passwords with mosquitto_passwd during deployment.
# Replace mosquitto/acl with generated per-device rules.
docker compose config
docker compose up -d postgres
```

Mosquitto should be started only after `mosquitto/passwords` exists and contains
at least an app account. The app account must have access to the command and
status topics required by the cloud application. Device accounts must be
restricted to their own topic prefix.

## Planned production topology

```text
phone -- HTTPS --> existing Nginx -- app
ESP32 -- MQTT/TLS --> Mosquitto
app ----------------> Mosquitto (private Docker network)
app ----------------> PostgreSQL (private Docker network)
```

The existing Nginx on the Ubuntu server owns ports 80 and 443, so the cloud app
will not publish those ports. A domain is required before adding the HTTPS route.
