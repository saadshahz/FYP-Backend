const pool = require("../config/database").pool;

async function listIndustries({ page, limit }) {
  const offset = (page - 1) * limit;
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT id, name, description
       FROM industries
       WHERE is_active = TRUE
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query("SELECT count(*)::int AS total FROM industries WHERE is_active = TRUE"),
  ]);
  return { data: items.rows, total: count.rows[0].total };
}

async function listServiceCategories({ page, limit, industryId }) {
  const values = [];
  let where = "WHERE sc.is_active = TRUE";
  if (industryId) {
    values.push(industryId);
    where += ` AND sc.industry_id = $${values.length}`;
  }
  values.push(limit, (page - 1) * limit);
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT sc.id, sc.name, sc.description, sc.industry_id AS "industryId",
              i.name AS "industryName"
       FROM service_categories sc
       LEFT JOIN industries i ON i.id = sc.industry_id AND i.is_active = TRUE
       ${where}
       ORDER BY sc.name
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    pool.query(`SELECT count(*)::int AS total FROM service_categories sc ${where}`, values.slice(0, values.length - 2)),
  ]);
  return { data: items.rows, total: count.rows[0].total };
}

async function findMemberships(userId) {
  const result = await pool.query(
    `SELECT o.id, o.name, o.organization_type, om.role,
            o.status AS organization_status
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'active'
     JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
     WHERE u.id = $1 AND u.status = 'active'
     ORDER BY o.name`,
    [userId]
  );
  return result.rows;
}

async function getOrganization(userId, organizationId) {
  const result = await pool.query(
    `SELECT o.id, o.name, o.organization_type AS "organizationType",
            o.industry_id AS "industryId", i.name AS "industryName",
            o.email, o.phone, o.address, o.city, o.state, o.country,
            o.postal_code AS "postalCode", o.status, o.created_at AS "createdAt",
            o.updated_at AS "updatedAt", om.role AS "membershipRole"
     FROM organizations o
     JOIN organization_memberships om
       ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     LEFT JOIN industries i ON i.id = o.industry_id
     WHERE o.id = $2 AND o.status = 'active'`,
    [userId, organizationId]
  );
  return result.rows[0] || null;
}

async function updateOrganization(userId, organizationId, input) {
  const columns = {
    name: "name",
    industryId: "industry_id",
    email: "email",
    phone: "phone",
    address: "address",
    city: "city",
    state: "state",
    country: "country",
    postalCode: "postal_code",
  };
  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(organizationId, userId);

  const result = await pool.query(
    `UPDATE organizations o
     SET ${assignments.join(", ")}
     WHERE o.id = $${values.length - 1}
       AND o.status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING o.id`,
    values
  );
  return result.rowCount === 1 ? getOrganization(userId, organizationId) : null;
}

async function isActiveIndustry(industryId) {
  const result = await pool.query(
    "SELECT 1 FROM industries WHERE id = $1 AND is_active = TRUE",
    [industryId]
  );
  return result.rowCount === 1;
}

async function getProviderProfile(userId, organizationId) {
  const result = await pool.query(
    `SELECT pp.id, pp.organization_id AS "organizationId",
            pp.description, pp.website_url AS "websiteUrl",
            pp.service_area AS "serviceArea",
            pp.emergency_available AS "emergencyAvailable",
            pp.response_time_hours AS "responseTimeHours",
            pp.verified_at AS "verifiedAt", pp.status,
            pp.created_at AS "createdAt", pp.updated_at AS "updatedAt"
     FROM provider_profiles pp
     JOIN organizations o ON o.id = pp.organization_id
     JOIN organization_memberships om
       ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE o.id = $2 AND o.organization_type = 'provider' AND o.status = 'active'`,
    [userId, organizationId]
  );
  return result.rows[0] || null;
}

async function updateProviderProfile(userId, organizationId, input) {
  const columns = {
    description: "description",
    websiteUrl: "website_url",
    serviceArea: "service_area",
    emergencyAvailable: "emergency_available",
    responseTimeHours: "response_time_hours",
  };
  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(organizationId, userId);

  const result = await pool.query(
    `UPDATE provider_profiles pp
     SET ${assignments.join(", ")}
     FROM organizations o
     WHERE pp.organization_id = o.id AND o.id = $${values.length - 1}
       AND o.organization_type = 'provider' AND o.status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING pp.id`,
    values
  );
  return result.rowCount === 1 ? getProviderProfile(userId, organizationId) : null;
}

async function isActiveServiceCategory(categoryId) {
  const result = await pool.query(
    "SELECT 1 FROM service_categories WHERE id = $1 AND is_active = TRUE",
    [categoryId]
  );
  return result.rowCount === 1;
}

async function listProviderServices(userId, organizationId) {
  const result = await pool.query(
    `SELECT ps.id, ps.provider_organization_id AS "organizationId",
            ps.service_category_id AS "serviceCategoryId",
            sc.name AS "serviceCategoryName", ps.name, ps.description,
            ps.base_price AS "basePrice", ps.currency, ps.is_active AS "isActive",
            ps.created_at AS "createdAt", ps.updated_at AS "updatedAt"
     FROM provider_services ps
     JOIN organizations o ON o.id = ps.provider_organization_id
     JOIN organization_memberships om
       ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     LEFT JOIN service_categories sc
       ON sc.id = ps.service_category_id AND sc.is_active = TRUE
     WHERE o.id = $2 AND o.organization_type = 'provider' AND o.status = 'active'
     ORDER BY ps.created_at DESC, ps.id`,
    [userId, organizationId]
  );
  return result.rows;
}

async function createProviderService(userId, organizationId, input) {
  const result = await pool.query(
    `INSERT INTO provider_services
       (provider_organization_id, service_category_id, name, description, base_price, currency)
     SELECT o.id, $3, $4, $5, $6, $7
     FROM organizations o
     WHERE o.id = $2 AND o.organization_type = 'provider' AND o.status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.organization_id = o.id AND om.user_id = $1
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING id, provider_organization_id AS "organizationId",
               service_category_id AS "serviceCategoryId", name, description,
               base_price AS "basePrice", currency, is_active AS "isActive",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      userId,
      organizationId,
      input.serviceCategoryId,
      input.name,
      input.description,
      input.basePrice,
      input.currency,
    ]
  );
  return result.rows[0] || null;
}

async function updateProviderService(userId, organizationId, serviceId, input) {
  const columns = {
    serviceCategoryId: "service_category_id",
    name: "name",
    description: "description",
    basePrice: "base_price",
    currency: "currency",
  };
  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(serviceId, organizationId, userId);

  const result = await pool.query(
    `UPDATE provider_services ps
     SET ${assignments.join(", ")}
     WHERE ps.id = $${values.length - 2}
       AND ps.provider_organization_id = $${values.length - 1}
       AND ps.is_active = TRUE
       AND EXISTS (
         SELECT 1 FROM organizations o
         JOIN organization_memberships om ON om.organization_id = o.id
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE o.id = ps.provider_organization_id AND o.organization_type = 'provider'
           AND o.status = 'active' AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING ps.id, ps.provider_organization_id AS "organizationId",
               ps.service_category_id AS "serviceCategoryId", ps.name,
               ps.description, ps.base_price AS "basePrice", ps.currency,
               ps.is_active AS "isActive", ps.updated_at AS "updatedAt"`,
    values
  );
  return result.rows[0] || null;
}

async function deactivateProviderService(userId, organizationId, serviceId) {
  const result = await pool.query(
    `UPDATE provider_services ps
     SET is_active = FALSE, updated_at = NOW()
     WHERE ps.id = $1 AND ps.provider_organization_id = $2 AND ps.is_active = TRUE
       AND EXISTS (
         SELECT 1 FROM organizations o
         JOIN organization_memberships om ON om.organization_id = o.id
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE o.id = ps.provider_organization_id AND o.organization_type = 'provider'
           AND o.status = 'active' AND om.user_id = $3
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING ps.id`,
    [serviceId, organizationId, userId]
  );
  return result.rowCount === 1;
}

function marketplaceConditions(filters) {
  const values = [];
  const conditions = [
    "o.organization_type = 'provider'",
    "o.status = 'active'",
    "pp.status = 'approved'",
  ];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.industryId) {
    const parameter = add(filters.industryId);
    conditions.push(
      `((o.industry_id = ${parameter} AND EXISTS (
          SELECT 1 FROM industries oi
          WHERE oi.id = o.industry_id AND oi.id = ${parameter} AND oi.is_active = TRUE
        )) OR EXISTS (
        SELECT 1 FROM provider_services ips
        JOIN service_categories isc ON isc.id = ips.service_category_id AND isc.is_active = TRUE
        JOIN industries ii ON ii.id = isc.industry_id AND ii.is_active = TRUE
        WHERE ips.provider_organization_id = o.id AND ips.is_active = TRUE
          AND isc.industry_id = ${parameter}
      ))`
    );
  }
  if (filters.serviceCategoryId) {
    const parameter = add(filters.serviceCategoryId);
    conditions.push(
      `EXISTS (
        SELECT 1 FROM provider_services fps
        JOIN service_categories fsc
          ON fsc.id = fps.service_category_id AND fsc.is_active = TRUE
        WHERE fps.provider_organization_id = o.id AND fps.is_active = TRUE
          AND fsc.id = ${parameter}
      )`
    );
  }
  if (filters.city) {
    const parameter = add(`%${filters.city.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`o.city ILIKE ${parameter} ESCAPE '\\'`);
  }
  if (filters.search) {
    const parameter = add(`%${filters.search.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(
      `(o.name ILIKE ${parameter} ESCAPE '\\'
        OR pp.description ILIKE ${parameter} ESCAPE '\\'
        OR pp.service_area ILIKE ${parameter} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM provider_services s
          LEFT JOIN service_categories c ON c.id = s.service_category_id AND c.is_active = TRUE
          WHERE s.provider_organization_id = o.id AND s.is_active = TRUE
            AND (s.name ILIKE ${parameter} ESCAPE '\\' OR c.name ILIKE ${parameter} ESCAPE '\\')
        ))`
    );
  }
  return { values, where: conditions.join(" AND ") };
}

async function listMarketplaceProviders(filters) {
  const { values, where } = marketplaceConditions(filters);
  const count = await pool.query(
    `SELECT count(*)::int AS total
     FROM organizations o
     JOIN provider_profiles pp ON pp.organization_id = o.id
     WHERE ${where}`,
    values
  );
  const dataValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT o.id, o.name, o.city, o.state, o.country,
            o.industry_id AS "industryId", i.name AS "industryName",
            pp.description, pp.website_url AS "websiteUrl",
            pp.service_area AS "serviceArea",
            pp.emergency_available AS "emergencyAvailable",
            pp.response_time_hours AS "responseTimeHours",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'name', s.name, 'description', s.description,
                'basePrice', s.base_price, 'currency', s.currency,
                'serviceCategoryId', c.id, 'serviceCategoryName', c.name
              ) ORDER BY s.name)
              FROM provider_services s
              LEFT JOIN service_categories c
                ON c.id = s.service_category_id AND c.is_active = TRUE
              WHERE s.provider_organization_id = o.id AND s.is_active = TRUE
                AND (s.service_category_id IS NULL OR c.id IS NOT NULL)
            ), '[]'::jsonb) AS services
     FROM organizations o
     JOIN provider_profiles pp ON pp.organization_id = o.id
     LEFT JOIN industries i ON i.id = o.industry_id AND i.is_active = TRUE
     WHERE ${where}
     ORDER BY o.name, o.id
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function getMarketplaceProvider(organizationId) {
  const result = await pool.query(
    `SELECT o.id, o.name, o.city, o.state, o.country,
            o.industry_id AS "industryId", i.name AS "industryName",
            pp.description, pp.website_url AS "websiteUrl",
            pp.service_area AS "serviceArea",
            pp.emergency_available AS "emergencyAvailable",
            pp.response_time_hours AS "responseTimeHours",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'name', s.name, 'description', s.description,
                'basePrice', s.base_price, 'currency', s.currency,
                'serviceCategoryId', c.id, 'serviceCategoryName', c.name
              ) ORDER BY s.name)
              FROM provider_services s
              LEFT JOIN service_categories c
                ON c.id = s.service_category_id AND c.is_active = TRUE
              WHERE s.provider_organization_id = o.id AND s.is_active = TRUE
                AND (s.service_category_id IS NULL OR c.id IS NOT NULL)
            ), '[]'::jsonb) AS services
     FROM organizations o
     JOIN provider_profiles pp ON pp.organization_id = o.id AND pp.status = 'approved'
     LEFT JOIN industries i ON i.id = o.industry_id AND i.is_active = TRUE
     WHERE o.id = $1 AND o.organization_type = 'provider' AND o.status = 'active'`,
    [organizationId]
  );
  return result.rows[0] || null;
}

async function approveProvider(actorUserId, organizationId, status) {
  const result = await pool.query(
    `UPDATE provider_profiles pp
     SET status = $3::varchar,
         verified_at = CASE WHEN $3::varchar = 'approved' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     FROM organizations o
     WHERE pp.organization_id = o.id AND o.id = $2
       AND o.organization_type = 'provider' AND o.status = 'active'
       AND pp.status = ANY($4::varchar[])
       AND NOT EXISTS (
         SELECT 1 FROM organization_memberships om
         WHERE om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
       )
     RETURNING pp.organization_id AS "organizationId", pp.status,
               pp.verified_at AS "verifiedAt"`,
    [
      actorUserId,
      organizationId,
      status,
      status === "approved" ? ["pending", "rejected"] : ["pending"],
    ]
  );
  if (result.rowCount === 1) {
    return { data: result.rows[0] };
  }

  const current = await pool.query(
    `SELECT pp.status,
            EXISTS (
              SELECT 1 FROM organization_memberships om
              WHERE om.organization_id = o.id AND om.user_id = $2 AND om.status = 'active'
            ) AS "actorIsMember"
     FROM provider_profiles pp
     JOIN organizations o ON o.id = pp.organization_id
     WHERE o.id = $1 AND o.organization_type = 'provider' AND o.status = 'active'`,
    [organizationId, actorUserId]
  );
  return { current: current.rows[0] || null };
}

module.exports = {
  approveProvider,
  createProviderService,
  deactivateProviderService,
  findMemberships,
  getMarketplaceProvider,
  getOrganization,
  getProviderProfile,
  isActiveIndustry,
  isActiveServiceCategory,
  listIndustries,
  listMarketplaceProviders,
  listProviderServices,
  listServiceCategories,
  updateOrganization,
  updateProviderProfile,
  updateProviderService,
};
