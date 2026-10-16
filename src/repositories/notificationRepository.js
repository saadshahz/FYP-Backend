async function notifyUser(client, userId, notification) {
  await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, related_entity_type, related_entity_id)
     SELECT id, $2, $3, $4, $5, $6::uuid
     FROM users
     WHERE id = $1 AND status = 'active'`,
    [
      userId,
      notification.type,
      notification.title,
      notification.message,
      notification.relatedEntityType,
      notification.relatedEntityId,
    ]
  );
}

async function notifyOrganizationMembers(client, organizationId, actorUserId, notification) {
  await notifyOrganizations(client, [organizationId], actorUserId, notification);
}

async function notifyOrganizations(client, organizationIds, actorUserId, notification) {
  await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, related_entity_type, related_entity_id)
     SELECT DISTINCT u.id, $3, $4, $5, $6, $7::uuid
     FROM organization_memberships om
     JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE om.organization_id = ANY($1::uuid[]) AND om.status = 'active'
       AND ($2::uuid IS NULL OR u.id <> $2)`,
    [
      organizationIds,
      actorUserId || null,
      notification.type,
      notification.title,
      notification.message,
      notification.relatedEntityType,
      notification.relatedEntityId,
    ]
  );
}

async function notifySupportStaff(client, actorUserId, notification) {
  await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, related_entity_type, related_entity_id)
     SELECT id, $2, $3, $4, $5, $6::uuid
     FROM users
     WHERE status = 'active' AND platform_role IN ('admin', 'support')
       AND ($1::uuid IS NULL OR id <> $1)`,
    [
      actorUserId || null,
      notification.type,
      notification.title,
      notification.message,
      notification.relatedEntityType,
      notification.relatedEntityId,
    ]
  );
}

module.exports = {
  notifyOrganizationMembers,
  notifyOrganizations,
  notifySupportStaff,
  notifyUser,
};
