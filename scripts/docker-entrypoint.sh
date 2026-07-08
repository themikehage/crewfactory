#!/bin/sh
set -e

DATA_PATH="${CREWFACTORY_DATA_PATH:-/app/data}"

mkdir -p "$DATA_PATH"

if [ "$(id -u)" = "0" ]; then
  chown -R crewfactory:crewfactory "$DATA_PATH"
fi

exec "$@"
