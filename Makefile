# Thin wrapper over dev.sh. Modules: db, server, client.
# Examples:
#   make up               # db -> migrate -> server -> client
#   make server           # start just the server (background, logs in .run/)
#   make logs-server      # follow the server log
#   make down             # stop everything
#   make restart-client   # restart just the client

.PHONY: up down status migrate \
        db server client \
        stop-db stop-server stop-client \
        restart-db restart-server restart-client \
        logs-db logs-server logs-client

up:      ; @./dev.sh up
down:    ; @./dev.sh down
status:  ; @./dev.sh status
migrate: ; @./dev.sh migrate

# start a single module
db:      ; @./dev.sh up db
server:  ; @./dev.sh up server
client:  ; @./dev.sh up client

# stop a single module
stop-db:     ; @./dev.sh down db
stop-server: ; @./dev.sh down server
stop-client: ; @./dev.sh down client

# restart a single module
restart-db:     ; @./dev.sh restart db
restart-server: ; @./dev.sh restart server
restart-client: ; @./dev.sh restart client

# follow a single module's log
logs-db:     ; @./dev.sh logs db -f
logs-server: ; @./dev.sh logs server -f
logs-client: ; @./dev.sh logs client -f
