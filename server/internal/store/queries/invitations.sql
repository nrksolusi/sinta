-- name: CreateInvitation :one
INSERT INTO invitations (tenant_id, role, token, created_by, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListInvitations :many
SELECT * FROM invitations
WHERE tenant_id = $1 AND expires_at > now()
ORDER BY created_at DESC;

-- name: GetInvitationByToken :one
SELECT i.*, t.name AS tenant_name
FROM invitations i
JOIN tenants t ON t.id = i.tenant_id
WHERE i.token = $1;

-- name: DeleteInvitation :execrows
DELETE FROM invitations
WHERE tenant_id = $1 AND id = $2;
