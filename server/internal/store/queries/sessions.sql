-- name: CreateSession :one
INSERT INTO sessions (user_id, active_tenant_id, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions
WHERE id = $1 AND expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = $1;

-- name: SetSessionActiveTenant :exec
UPDATE sessions
SET active_tenant_id = $2
WHERE id = $1;
