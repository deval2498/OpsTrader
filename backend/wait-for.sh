#!/bin/sh
# wait-for.sh

host="$1"
shift
port="$1"
shift

# Loop until we get a PONG response from redis-cli ping
until redis-cli -h "$host" -p "$port" ping | grep -q PONG; do
  echo "Waiting for Redis at $host:$port..."
  sleep 1
done

echo "Redis is up and running at $host:$port!"

# Execute the remaining command arguments
exec "$@"
