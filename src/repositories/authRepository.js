async function findUserByEmail(client, email) {
  const result = await client.query(
    `SELECT id, email, first_name, last_name, phone, password_hash, platform_role, status
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function createRegistration(client, input, passwordHash) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [input.email]);

  const existing = await client.query(
    "SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1",
    [input.email]
  );
  if (existing.rowCount > 0) {
    return null;
  }

  const userResult = await client.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, phone, platform_role, status)
     VALUES ($1, $2, $3, $4, $5, 'user', 'active')
     RETURNING id, first_name, last_name, email, phone, platform_role, status, created_at`,
    [input.firstName, input.lastName, input.email, passwordHash, input.phone]
  );
  const user = userResult.rows[0];

  const organizationResult = await client.query(
    `INSERT INTO organizations (name, organization_type, email, phone, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id, name, organization_type, status`,
    [input.organizationName, input.organizationType, input.email, input.phone]
  );
  const organization = organizationResult.rows[0];

  await client.query(
    `INSERT INTO organization_memberships (user_id, organization_id, role, status)
     VALUES ($1, $2, 'owner', 'active')`,
    [user.id, organization.id]
  );

  if (input.organizationType === "provider") {
    await client.query(
      `INSERT INTO provider_profiles (organization_id, status)
       VALUES ($1, 'pending')`,
      [organization.id]
    );
  }

  await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, related_entity_type, related_entity_id)
     SELECT id, 'new_registration', 'New registration',
            'A new organization has registered.', 'organization', $1
     FROM users
     WHERE platform_role = 'admin' AND status = 'active'`,
    [organization.id]
  );

  return { user, organization };
}

async function markLogin(client, userId) {
  const result = await client.query(
    `UPDATE users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING id`,
    [userId]
  );
  return result.rowCount === 1;
}

async function findActiveProfile(client, userId) {
  const result = await client.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
            u.platform_role, u.status, u.email_verified_at, u.created_at,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', om.id,
                  'organizationId', o.id,
                  'organizationName', o.name,
                  'organizationType', o.organization_type,
                  'organizationStatus', o.status,
                  'role', om.role,
                  'status', om.status
                )
                ORDER BY o.name
              ) FILTER (WHERE om.id IS NOT NULL),
              '[]'::jsonb
            ) AS memberships
     FROM users u
     LEFT JOIN organization_memberships om ON om.user_id = u.id
     LEFT JOIN organizations o ON o.id = om.organization_id
     WHERE u.id = $1 AND u.status = 'active'
     GROUP BY u.id`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  createRegistration,
  findActiveProfile,
  findUserByEmail,
  markLogin,
};
