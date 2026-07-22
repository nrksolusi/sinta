-- name: ListMembershipsForUser :many
SELECT m.role, t.id AS tenant_id, t.name AS tenant_name, t.active AS tenant_active
FROM memberships m
JOIN tenants t ON t.id = m.tenant_id
WHERE m.user_id = $1
ORDER BY t.name;

-- name: GetMembership :one
SELECT * FROM memberships
WHERE user_id = $1 AND tenant_id = $2;
