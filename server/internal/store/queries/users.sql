-- name: CreateUser :one
INSERT INTO users (email, password_hash, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1;

-- name: SetUserLastActiveTenant :exec
UPDATE users
SET last_active_tenant_id = $2,
    updated_at = now()
WHERE id = $1;
