-- name: ListMembers :many
SELECT m.user_id, u.name, u.email, m.role
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.tenant_id = $1
ORDER BY u.name;

-- name: CountOwners :one
SELECT count(*) FROM memberships
WHERE tenant_id = $1 AND role = 'owner';

-- name: UpdateMembershipRole :one
UPDATE memberships
SET role = $3
WHERE tenant_id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteMembership :execrows
DELETE FROM memberships
WHERE tenant_id = $1 AND user_id = $2;
