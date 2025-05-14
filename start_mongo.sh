#!/bin/bash

# dossier de stockage
DB_PATH="$HOME/mongo-data"
PORT=27042

echo "lancement de MongoDB port: $PORT, dbpath: $DB_PATH"
mongod --dbpath "$DB_PATH" --port "$PORT"