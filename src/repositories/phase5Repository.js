const { pool } = require("../config/database");

async function findConsumerMemberships(userId) {
  const result = await pool.query(
    `SELECT o.id, o.name, o.organization_type AS "organizationType", om.role
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'active'
     JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
     WHERE u.id = $1 AND u.status = 'active'
     ORDER BY o.name, o.id`,
    [userId]
  );
  return result.rows;
}

async function listAssets(userId, organizationId, filters) {
  const values = [userId, organizationId];
  const conditions = [
    "a.owner_organization_id = $2",
    "o.organization_type = 'consumer'",
    "o.status = 'active'",
    "om.user_id = $1",
    "om.status = 'active'",
    "u.status = 'active'",
  ];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`a.status = $${values.length}`);
  }
  if (filters.category) {
    values.push(`%${filters.category.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`a.category ILIKE $${values.length} ESCAPE '\\'`);
  }
  const where = conditions.join(" AND ");
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT a.id, a.owner_organization_id AS "organizationId", a.name,
              a.category, a.manufacturer, a.model, a.serial_number AS "serialNumber",
              a.location, a.install_date::text AS "installDate",
              a.warranty_expiry::text AS "warrantyExpiry", a.status,
              a.last_maintenance_at AS "lastMaintenanceAt",
              a.next_maintenance_at AS "nextMaintenanceAt",
              a.created_at AS "createdAt", a.updated_at AS "updatedAt"
       FROM assets a
       JOIN organizations o ON o.id = a.owner_organization_id
       JOIN organization_memberships om ON om.organization_id = o.id
       JOIN users u ON u.id = om.user_id
       WHERE ${where}
       ORDER BY a.created_at DESC, a.id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, filters.limit, (filters.page - 1) * filters.limit]
    ),
    pool.query(
      `SELECT count(*)::int AS total
       FROM assets a
       JOIN organizations o ON o.id = a.owner_organization_id
       JOIN organization_memberships om ON om.organization_id = o.id
       JOIN users u ON u.id = om.user_id
       WHERE ${where}`,
      values
    ),
  ]);
  return { data: items.rows, total: count.rows[0].total };
}

async function getAsset(userId, assetId) {
  const result = await pool.query(
    `SELECT a.id, a.owner_organization_id AS "organizationId", a.name,
            a.category, a.manufacturer, a.model, a.serial_number AS "serialNumber",
            a.location, a.install_date::text AS "installDate",
            a.warranty_expiry::text AS "warrantyExpiry", a.status,
            a.last_maintenance_at AS "lastMaintenanceAt",
            a.next_maintenance_at AS "nextMaintenanceAt",
            a.created_at AS "createdAt", a.updated_at AS "updatedAt"
     FROM assets a
     JOIN organizations o
       ON o.id = a.owner_organization_id AND o.organization_type = 'consumer'
       AND o.status = 'active'
     JOIN organization_memberships om
       ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE a.id = $2`,
    [userId, assetId]
  );
  return result.rows[0] || null;
}

async function createAsset(userId, organizationId, input) {
  const result = await pool.query(
    `INSERT INTO assets
       (owner_organization_id, name, category, manufacturer, model, serial_number,
        location, install_date, warranty_expiry)
     SELECT o.id, $3, $4, $5, $6, $7, $8, $9, $10
     FROM organizations o
     WHERE o.id = $2 AND o.organization_type = 'consumer' AND o.status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
           AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING id`,
    [
      userId,
      organizationId,
      input.name,
      input.category,
      input.manufacturer,
      input.model,
      input.serialNumber,
      input.location,
      input.installDate,
      input.warrantyExpiry,
    ]
  );
  return result.rowCount === 1 ? getAsset(userId, result.rows[0].id) : null;
}

async function updateAsset(userId, assetId, input) {
  const columns = {
    name: "name",
    category: "category",
    manufacturer: "manufacturer",
    model: "model",
    serialNumber: "serial_number",
    location: "location",
    installDate: "install_date",
    warrantyExpiry: "warranty_expiry",
  };
  const values = [];
  const assignments = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(assetId, userId);
  const result = await pool.query(
    `UPDATE assets a
     SET ${assignments.join(", ")}
     FROM organizations o
     WHERE a.id = $${values.length - 1}
       AND o.id = a.owner_organization_id AND o.organization_type = 'consumer'
       AND o.status = 'active' AND a.status <> 'retired'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING a.id`,
    values
  );
  return result.rowCount === 1 ? getAsset(userId, assetId) : null;
}

async function retireAsset(client, userId, assetId) {
  const result = await client.query(
    `UPDATE assets a
     SET status = 'retired', updated_at = NOW()
     FROM organizations o
     WHERE a.id = $1 AND a.owner_organization_id = o.id
       AND o.organization_type = 'consumer' AND o.status = 'active'
       AND a.status <> 'retired'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $2
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING a.id`,
    [assetId, userId]
  );
  if (result.rowCount !== 1) {
    return false;
  }
  await client.query(
    `UPDATE maintenance_plans
     SET is_active = FALSE, updated_at = NOW()
     WHERE asset_id = $1 AND is_active = TRUE`,
    [assetId]
  );
  return true;
}

async function providerIsApproved(providerOrganizationId) {
  const result = await pool.query(
    `SELECT 1
     FROM organizations o
     JOIN provider_profiles pp ON pp.organization_id = o.id AND pp.status = 'approved'
     WHERE o.id = $1 AND o.organization_type = 'provider' AND o.status = 'active'`,
    [providerOrganizationId]
  );
  return result.rowCount === 1;
}

async function hasActiveDuplicateMaintenancePlan(
  client,
  assetId,
  providerOrganizationId,
  frequency,
  excludePlanId
) {
  const result = await client.query(
    `SELECT 1
     FROM maintenance_plans
     WHERE asset_id = $1 AND provider_organization_id = $2
       AND frequency = $3 AND is_active = TRUE
       AND ($4::uuid IS NULL OR id <> $4)
     LIMIT 1`,
    [assetId, providerOrganizationId, frequency, excludePlanId || null]
  );
  return result.rowCount > 0;
}

async function listMaintenancePlans(userId, assetId) {
  const result = await pool.query(
    `SELECT mp.id, mp.asset_id AS "assetId",
            mp.provider_organization_id AS "providerOrganizationId",
            o.name AS "providerOrganizationName", a.status AS "assetStatus",
            mp.frequency,
            mp.next_due_at AS "nextDueAt", mp.is_active AS "isActive",
            mp.created_at AS "createdAt", mp.updated_at AS "updatedAt"
     FROM maintenance_plans mp
     JOIN assets a ON a.id = mp.asset_id
     JOIN organizations co ON co.id = a.owner_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om
       ON om.organization_id = co.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     JOIN organizations o ON o.id = mp.provider_organization_id
     WHERE a.id = $2
     ORDER BY mp.created_at DESC, mp.id`,
    [userId, assetId]
  );
  return result.rows;
}

async function createMaintenancePlan(client, userId, assetId, input) {
  const inserted = await client.query(
    `INSERT INTO maintenance_plans
       (asset_id, provider_organization_id, frequency, next_due_at, is_active)
     SELECT a.id, po.id, $4, $5, TRUE
     FROM assets a
     JOIN organizations co ON co.id = a.owner_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organizations po ON po.id = $3
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     WHERE a.id = $1 AND a.status <> 'retired'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = co.id AND om.user_id = $2 AND om.status = 'active'
           AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING id`,
    [assetId, userId, input.providerOrganizationId, input.frequency, input.nextDueAt]
  );
  return inserted.rows[0] ? { id: inserted.rows[0].id } : null;
}

async function updateMaintenancePlan(client, userId, planId, input, requireApprovedProvider) {
  const columns = {
    providerOrganizationId: "provider_organization_id",
    frequency: "frequency",
    nextDueAt: "next_due_at",
    isActive: "is_active",
  };
  const values = [];
  const assignments = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(input.providerOrganizationId || null);
  const providerParameter = values.length;
  values.push(requireApprovedProvider);
  const approvalParameter = values.length;
  values.push(planId, userId);
  const result = await client.query(
    `UPDATE maintenance_plans mp
     SET ${assignments.join(", ")}
     FROM assets a, organizations co, organizations po, provider_profiles pp
     WHERE mp.id = $${values.length - 1} AND a.id = mp.asset_id
       AND co.id = a.owner_organization_id AND co.organization_type = 'consumer'
       AND co.status = 'active'
       AND po.id = COALESCE($${providerParameter}::uuid, mp.provider_organization_id)
       AND po.organization_type = 'provider' AND po.status = 'active'
       AND pp.organization_id = po.id
       AND (NOT $${approvalParameter}::boolean OR pp.status = 'approved')
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = co.id AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING mp.id`,
    values
  );
  return result.rowCount === 1 ? { id: result.rows[0].id } : null;
}

async function getMaintenancePlan(userId, planId) {
  const result = await pool.query(
    `SELECT mp.id, mp.asset_id AS "assetId",
            mp.provider_organization_id AS "providerOrganizationId",
            po.name AS "providerOrganizationName", a.status AS "assetStatus",
            mp.frequency,
            mp.next_due_at AS "nextDueAt", mp.is_active AS "isActive",
            mp.created_at AS "createdAt", mp.updated_at AS "updatedAt"
     FROM maintenance_plans mp
     JOIN assets a ON a.id = mp.asset_id
     JOIN organizations co ON co.id = a.owner_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om
       ON om.organization_id = co.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     JOIN organizations po ON po.id = mp.provider_organization_id
     WHERE mp.id = $2`,
    [userId, planId]
  );
  return result.rows[0] || null;
}

async function deactivateMaintenancePlan(userId, planId) {
  const result = await pool.query(
    `UPDATE maintenance_plans mp
     SET is_active = FALSE, updated_at = NOW()
     FROM assets a, organizations co
     WHERE mp.id = $1 AND a.id = mp.asset_id
       AND co.id = a.owner_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = co.id AND om.user_id = $2
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING mp.id`,
    [planId, userId]
  );
  return result.rowCount === 1;
}

module.exports = {
  createAsset,
  createMaintenancePlan,
  deactivateMaintenancePlan,
  findConsumerMemberships,
  getAsset,
  getMaintenancePlan,
  hasActiveDuplicateMaintenancePlan,
  listAssets,
  listMaintenancePlans,
  providerIsApproved,
  retireAsset,
  updateAsset,
  updateMaintenancePlan,
};
