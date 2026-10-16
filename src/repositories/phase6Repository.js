const { pool } = require("../config/database");
const { notifyOrganizationMembers } = require("./notificationRepository");

async function findActiveMemberships(userId) {
  const result = await pool.query(
    `SELECT o.id, o.organization_type AS "organizationType", om.role
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'active'
     JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
     WHERE u.id = $1 AND u.status = 'active'
     ORDER BY o.id`,
    [userId]
  );
  return result.rows;
}

async function isActiveAdmin(userId) {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND platform_role = 'admin'",
    [userId]
  );
  return result.rowCount === 1;
}

async function isActiveCategory(categoryId) {
  const result = await pool.query(
    "SELECT 1 FROM service_categories WHERE id = $1 AND is_active = TRUE",
    [categoryId]
  );
  return result.rowCount === 1;
}

async function getOwnedEligibleAsset(userId, organizationId, assetId) {
  const result = await pool.query(
    `SELECT a.id
     FROM assets a
     JOIN organizations o ON o.id = a.owner_organization_id
       AND o.organization_type = 'consumer' AND o.status = 'active'
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE a.id = $2 AND o.id = $3 AND a.status = 'active'`,
    [userId, assetId, organizationId]
  );
  return result.rowCount === 1;
}

async function providerIsApproved(providerOrganizationId) {
  const result = await pool.query(
    `SELECT 1 FROM organizations o
     JOIN provider_profiles pp ON pp.organization_id = o.id AND pp.status = 'approved'
     WHERE o.id = $1 AND o.organization_type = 'provider' AND o.status = 'active'`,
    [providerOrganizationId]
  );
  return result.rowCount === 1;
}

async function providerOffersRequest(providerOrganizationId, serviceCategoryId, serviceType) {
  const result = await pool.query(
    `SELECT 1
     FROM provider_services ps
     LEFT JOIN service_categories sc ON sc.id = ps.service_category_id
       AND sc.is_active = TRUE
     WHERE ps.provider_organization_id = $1 AND ps.is_active = TRUE
       AND (
         ($2::uuid IS NOT NULL AND ps.service_category_id = $2 AND sc.id IS NOT NULL)
         OR (
           $2::uuid IS NULL AND $3::varchar IS NOT NULL
           AND lower(ps.name) = lower($3)
         )
       )
     LIMIT 1`,
    [providerOrganizationId, serviceCategoryId, serviceType]
  );
  return result.rowCount === 1;
}

async function createRequest(userId, organizationId, requestNumber, input) {
  const result = await pool.query(
    `INSERT INTO service_requests
       (request_number, consumer_organization_id, requested_by_user_id, provider_organization_id, asset_id,
        service_category_id, service_type, description, priority, status, preferred_at)
       SELECT $3, o.id, u.id, $4, $5, $6, $7, $8, $9, 'submitted', $10
     FROM organizations o
     JOIN users u ON u.id = $1 AND u.status = 'active'
     WHERE o.id = $2 AND o.organization_type = 'consumer' AND o.status = 'active'
         AND (
           $4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM organizations po
             JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
             WHERE po.id = $4 AND po.organization_type = 'provider' AND po.status = 'active'
           )
         )
         AND (
           $4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM provider_services ps
             LEFT JOIN service_categories sc ON sc.id = ps.service_category_id
               AND sc.is_active = TRUE
             WHERE ps.provider_organization_id = $4 AND ps.is_active = TRUE
               AND (
                 ($6::uuid IS NOT NULL AND ps.service_category_id = $6 AND sc.id IS NOT NULL)
                 OR ($6::uuid IS NULL AND $7::varchar IS NOT NULL
                     AND lower(ps.name) = lower($7))
               )
           )
         )
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         WHERE om.organization_id = o.id AND om.user_id = u.id
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING id`,
    [
      userId,
      organizationId,
      requestNumber,
      input.providerOrganizationId,
      input.assetId,
      input.serviceCategoryId,
      input.serviceType,
      input.description,
      input.priority,
      input.preferredAt,
    ]
  );
  return result.rows[0] ? getRequestById(result.rows[0].id) : null;
}

async function getRequestById(requestId) {
  const result = await pool.query(
    `SELECT sr.id, sr.request_number AS "requestNumber",
            sr.consumer_organization_id AS "consumerOrganizationId",
            co.name AS "consumerOrganizationName",
            sr.requested_by_user_id AS "requestedByUserId",
            sr.provider_organization_id AS "providerOrganizationId",
            po.name AS "providerOrganizationName",
            sr.asset_id AS "assetId", a.name AS "assetName",
            a.category AS "assetCategory", sr.service_category_id AS "serviceCategoryId",
            sc.name AS "serviceCategoryName", sr.service_type AS "serviceType",
            sr.description, sr.priority, sr.status,
            sr.preferred_at AS "preferredAt", sr.created_at AS "createdAt",
            sr.updated_at AS "updatedAt"
     FROM service_requests sr
     JOIN organizations co ON co.id = sr.consumer_organization_id
     LEFT JOIN organizations po ON po.id = sr.provider_organization_id
     LEFT JOIN assets a ON a.id = sr.asset_id
     LEFT JOIN service_categories sc ON sc.id = sr.service_category_id
     WHERE sr.id = $1`,
    [requestId]
  );
  return result.rows[0] || null;
}

async function getRequestForConsumer(userId, requestId) {
  const result = await pool.query(
    `SELECT sr.id
     FROM service_requests sr
     JOIN organizations o ON o.id = sr.consumer_organization_id
       AND o.organization_type = 'consumer' AND o.status = 'active'
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.id = $2`,
    [userId, requestId]
  );
  return result.rowCount === 1;
}

async function getRequestForProvider(userId, requestId, providerOrganizationId) {
  const result = await pool.query(
    `SELECT 1
     FROM service_requests sr
     JOIN organizations po ON po.id = $3 AND po.organization_type = 'provider'
       AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.id = $2
       AND (
         sr.provider_organization_id = po.id
         OR EXISTS (
           SELECT 1 FROM quotes q
           WHERE q.service_request_id = sr.id AND q.provider_organization_id = po.id
         )
       )`,
    [userId, requestId, providerOrganizationId]
  );
  return result.rowCount === 1;
}

async function isProviderEligibleForRequest(providerOrganizationId, requestId) {
  const result = await pool.query(
    `SELECT 1
     FROM service_requests sr
     JOIN organizations po ON po.id = $1 AND po.organization_type = 'provider'
       AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     WHERE sr.id = $2 AND sr.status IN ('submitted', 'assigned', 'quoted')
       AND (sr.provider_organization_id IS NULL OR sr.provider_organization_id = po.id)
       AND (
         (sr.service_category_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           JOIN service_categories sc ON sc.id = ps.service_category_id
             AND sc.is_active = TRUE
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND ps.service_category_id = sr.service_category_id
         ))
         OR
         (sr.service_category_id IS NULL AND sr.service_type IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND lower(ps.name) = lower(sr.service_type)
         ))
       )`,
    [providerOrganizationId, requestId]
  );
  return result.rowCount === 1;
}

function pageConditions(filters, values) {
  const conditions = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`sr.status = $${values.length}`);
  }
  if (filters.priority) {
    values.push(filters.priority);
    conditions.push(`sr.priority = $${values.length}`);
  }
  return conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
}

async function listConsumerRequests(userId, organizationId, filters) {
  const values = [userId, organizationId];
  const extra = pageConditions(filters, values);
  const count = await pool.query(
    `SELECT count(*)::int AS total
     FROM service_requests sr
     JOIN organizations o ON o.id = sr.consumer_organization_id
       AND o.organization_type = 'consumer' AND o.status = 'active'
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.consumer_organization_id = $2${extra}`,
    values
  );
  const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT sr.id, sr.request_number AS "requestNumber",
            sr.consumer_organization_id AS "consumerOrganizationId",
            sr.provider_organization_id AS "providerOrganizationId",
            sr.asset_id AS "assetId", sr.service_category_id AS "serviceCategoryId",
            sr.service_type AS "serviceType", sr.description, sr.priority, sr.status,
            sr.preferred_at AS "preferredAt", sr.created_at AS "createdAt",
            sr.updated_at AS "updatedAt"
     FROM service_requests sr
     JOIN organizations o ON o.id = sr.consumer_organization_id
       AND o.organization_type = 'consumer' AND o.status = 'active'
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.consumer_organization_id = $2${extra}
     ORDER BY sr.created_at DESC, sr.id
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function listProviderRequests(userId, providerOrganizationId, filters) {
  const values = [userId, providerOrganizationId];
  const extra = pageConditions(filters, values);
  const joins = `
     JOIN organizations o ON o.id = $2 AND o.organization_type = 'provider'
       AND o.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = o.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'`;
  const visible = `
       AND sr.status IN ('submitted', 'assigned', 'quoted')
       AND (sr.provider_organization_id IS NULL OR sr.provider_organization_id = o.id)
       AND (
         (sr.service_category_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           JOIN service_categories sc ON sc.id = ps.service_category_id
             AND sc.is_active = TRUE
           WHERE ps.provider_organization_id = o.id AND ps.is_active = TRUE
             AND ps.service_category_id = sr.service_category_id
         ))
         OR
         (sr.service_category_id IS NULL AND sr.service_type IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           WHERE ps.provider_organization_id = o.id AND ps.is_active = TRUE
             AND lower(ps.name) = lower(sr.service_type)
         ))
         OR EXISTS (
           SELECT 1 FROM quotes own_quote
           WHERE own_quote.service_request_id = sr.id
             AND own_quote.provider_organization_id = o.id
         )
       )`;
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM service_requests sr ${joins}
     WHERE TRUE${visible}${extra}`,
    values
  );
  const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT sr.id, sr.request_number AS "requestNumber",
            sr.provider_organization_id AS "providerOrganizationId",
            sr.asset_id AS "assetId", a.name AS "assetName",
            a.category AS "assetCategory", sr.service_category_id AS "serviceCategoryId",
            sc.name AS "serviceCategoryName", sr.service_type AS "serviceType",
            sr.description, sr.priority, sr.status, sr.preferred_at AS "preferredAt",
            sr.created_at AS "createdAt"
     FROM service_requests sr ${joins}
     LEFT JOIN assets a ON a.id = sr.asset_id
     LEFT JOIN service_categories sc ON sc.id = sr.service_category_id AND sc.is_active = TRUE
     WHERE TRUE${visible}${extra}
     ORDER BY sr.created_at DESC, sr.id
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function listAdminRequests(filters) {
  const values = [];
  const extra = pageConditions(filters, values);
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM service_requests sr WHERE TRUE${extra}`,
    values
  );
  const pageValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT sr.id, sr.request_number AS "requestNumber",
            sr.consumer_organization_id AS "consumerOrganizationId",
            sr.provider_organization_id AS "providerOrganizationId",
            sr.asset_id AS "assetId", sr.service_category_id AS "serviceCategoryId",
            sr.service_type AS "serviceType", sr.description, sr.priority, sr.status,
            sr.preferred_at AS "preferredAt", sr.created_at AS "createdAt",
            sr.updated_at AS "updatedAt"
     FROM service_requests sr
     WHERE TRUE${extra}
     ORDER BY sr.created_at DESC, sr.id
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function updateConsumerRequest(userId, requestId, input) {
  const columns = {
    assetId: "asset_id",
    serviceCategoryId: "service_category_id",
    serviceType: "service_type",
    description: "description",
    priority: "priority",
    preferredAt: "preferred_at",
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
  values.push(requestId, userId);
  const result = await pool.query(
    `UPDATE service_requests sr
     SET ${assignments.join(", ")}
     WHERE sr.id = $${values.length - 1} AND sr.status = 'submitted'
       AND EXISTS (
         SELECT 1 FROM organizations o
         JOIN organization_memberships om ON om.organization_id = o.id
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE o.id = sr.consumer_organization_id AND o.organization_type = 'consumer'
           AND o.status = 'active' AND om.user_id = $${values.length}
           AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
       )
     RETURNING sr.id`,
    values
  );
  return result.rowCount === 1 ? getRequestById(requestId) : null;
}

async function cancelRequest(userId, requestId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT sr.id, sr.status
       FROM service_requests sr
       JOIN organizations o ON o.id = sr.consumer_organization_id
       JOIN organization_memberships om ON om.organization_id = o.id
         AND om.user_id = $1 AND om.status = 'active'
       JOIN users u ON u.id = om.user_id AND u.status = 'active'
       WHERE sr.id = $2 AND o.organization_type = 'consumer' AND o.status = 'active'
         AND om.role IN ('owner', 'admin', 'manager')
       FOR UPDATE OF sr`,
      [userId, requestId]
    );
    if (!locked.rows[0]) {
      await client.query("ROLLBACK");
      return { missing: true };
    }
    if (!["draft", "submitted", "assigned", "quoted"].includes(locked.rows[0].status)) {
      await client.query("ROLLBACK");
      return { conflict: true, status: locked.rows[0].status };
    }
    await client.query(
      `UPDATE quotes SET status = CASE WHEN status = 'draft' THEN 'cancelled' ELSE 'rejected' END,
              updated_at = NOW()
       WHERE service_request_id = $1 AND status IN ('draft', 'submitted')`,
      [requestId]
    );
    await client.query(
      "UPDATE service_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [requestId]
    );
    await client.query("COMMIT");
    return { data: await getRequestById(requestId) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listRequestQuotes(requestId, providerOrganizationId) {
  const values = [requestId];
  let scope = "";
  if (providerOrganizationId) {
    values.push(providerOrganizationId);
    scope = " AND q.provider_organization_id = $2";
  } else {
    scope = " AND q.status <> 'draft'";
  }
  const result = await pool.query(
    `SELECT q.id, q.service_request_id AS "serviceRequestId",
            q.provider_organization_id AS "providerOrganizationId",
            po.name AS "providerOrganizationName", q.submitted_by_user_id AS "submittedByUserId",
            q.status, q.currency, q.subtotal, q.tax_amount AS "taxAmount",
            q.total_amount AS "totalAmount", q.estimated_days AS "estimatedDays",
            q.valid_until AS "validUntil", q.notes,
            q.created_at AS "createdAt", q.updated_at AS "updatedAt",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', qi.id, 'description', qi.description, 'quantity', qi.quantity,
                'unitPrice', qi.unit_price, 'lineTotal', qi.line_total
              ) ORDER BY qi.created_at, qi.id)
              FROM quote_items qi WHERE qi.quote_id = q.id
            ), '[]'::jsonb) AS items
     FROM quotes q
     JOIN service_requests sr ON sr.id = q.service_request_id
     JOIN organizations po ON po.id = q.provider_organization_id
     WHERE q.service_request_id = $1${scope}
     ORDER BY q.created_at, q.id`,
    values
  );
  return result.rows;
}

async function getQuoteById(quoteId) {
  const result = await pool.query(
    `SELECT q.id, q.service_request_id AS "serviceRequestId",
            sr.consumer_organization_id AS "consumerOrganizationId",
            q.provider_organization_id AS "providerOrganizationId",
            po.name AS "providerOrganizationName", q.submitted_by_user_id AS "submittedByUserId",
            q.status, q.currency, q.subtotal, q.tax_amount AS "taxAmount",
            q.total_amount AS "totalAmount", q.estimated_days AS "estimatedDays",
            q.valid_until AS "validUntil", q.notes,
            q.created_at AS "createdAt", q.updated_at AS "updatedAt",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', qi.id, 'description', qi.description, 'quantity', qi.quantity,
                'unitPrice', qi.unit_price, 'lineTotal', qi.line_total
              ) ORDER BY qi.created_at, qi.id)
              FROM quote_items qi WHERE qi.quote_id = q.id
            ), '[]'::jsonb) AS items
     FROM quotes q
     JOIN service_requests sr ON sr.id = q.service_request_id
     JOIN organizations po ON po.id = q.provider_organization_id
     WHERE q.id = $1`,
    [quoteId]
  );
  return result.rows[0] || null;
}

async function insertQuoteItems(client, quoteId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO quote_items (quote_id, description, quantity, unit_price, line_total)
       VALUES ($1, $2, $3::numeric, $4::numeric, ROUND($3::numeric * $4::numeric, 2))`,
      [quoteId, item.description, item.quantity, item.unitPrice]
    );
  }
}

async function recalculateQuote(client, quoteId, taxAmount) {
  const updated = await client.query(
    `UPDATE quotes q
     SET subtotal = totals.subtotal, tax_amount = $2::numeric,
         total_amount = totals.subtotal + $2::numeric, updated_at = NOW()
     FROM (
       SELECT COALESCE(SUM(line_total), 0)::numeric(12, 2) AS subtotal
       FROM quote_items WHERE quote_id = $1
     ) totals
     WHERE q.id = $1 AND totals.subtotal + $2::numeric <= 9999999999.99`,
    [quoteId, taxAmount]
  );
  return updated.rowCount === 1;
}

async function createQuote(client, requestId, providerOrganizationId, userId, input) {
  const result = await client.query(
    `INSERT INTO quotes
       (service_request_id, provider_organization_id, submitted_by_user_id,
        status, currency, tax_amount, estimated_days, valid_until, notes)
     SELECT sr.id, po.id, u.id, 'draft', $4, $5::numeric, $6, $7, $8
     FROM service_requests sr
     JOIN organizations po ON po.id = $2 AND po.organization_type = 'provider'
       AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN users u ON u.id = $3 AND u.status = 'active'
     WHERE sr.id = $1 AND sr.status IN ('submitted', 'assigned', 'quoted')
       AND (sr.provider_organization_id IS NULL OR sr.provider_organization_id = po.id)
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         WHERE om.organization_id = po.id AND om.user_id = u.id AND om.status = 'active'
           AND om.role IN ('owner', 'admin', 'manager')
       )
       AND (
         (sr.service_category_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           JOIN service_categories sc ON sc.id = ps.service_category_id AND sc.is_active = TRUE
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND ps.service_category_id = sr.service_category_id
         ))
         OR (sr.service_category_id IS NULL AND sr.service_type IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND lower(ps.name) = lower(sr.service_type)
         ))
       )
       AND NOT EXISTS (
         SELECT 1 FROM quotes existing
         WHERE existing.service_request_id = sr.id
           AND existing.provider_organization_id = po.id
           AND existing.status IN ('draft', 'submitted', 'accepted')
       )
     RETURNING id`,
    [
      requestId,
      providerOrganizationId,
      userId,
      input.currency,
      input.taxAmount,
      input.estimatedDays,
      input.validUntil,
      input.notes,
    ]
  );
  if (!result.rows[0]) {
    return null;
  }
  await insertQuoteItems(client, result.rows[0].id, input.items);
  if (!(await recalculateQuote(client, result.rows[0].id, input.taxAmount))) {
    return null;
  }
  return result.rows[0].id;
}

async function updateDraftQuote(client, quoteId, userId, providerOrganizationId, input) {
  const lock = await client.query(
    `SELECT q.id, q.service_request_id
     FROM quotes q
     JOIN service_requests sr ON sr.id = q.service_request_id
     JOIN organizations po ON po.id = q.provider_organization_id
       AND po.status = 'active' AND po.organization_type = 'provider'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $2 AND om.status = 'active'
       AND om.role IN ('owner', 'admin', 'manager')
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE q.id = $1 AND q.provider_organization_id = $3
       AND q.status = 'draft' AND sr.status IN ('submitted', 'assigned', 'quoted')
     FOR UPDATE OF q`,
    [quoteId, userId, providerOrganizationId]
  );
  if (!lock.rows[0]) {
    return null;
  }
  const assignments = [];
  const values = [];
  const columns = {
    currency: "currency",
    taxAmount: "tax_amount",
    estimatedDays: "estimated_days",
    validUntil: "valid_until",
    notes: "notes",
  };
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(
        `${column} = $${values.length}${field === "taxAmount" ? "::numeric" : ""}`
      );
    }
  }
  if (assignments.length > 0) {
    assignments.push("updated_at = NOW()");
    values.push(quoteId);
    await client.query(
      `UPDATE quotes SET ${assignments.join(", ")} WHERE id = $${values.length}`,
      values
    );
  }
  if (Object.hasOwn(input, "items")) {
    await client.query("DELETE FROM quote_items WHERE quote_id = $1", [quoteId]);
    await insertQuoteItems(client, quoteId, input.items);
  }
  if (Object.hasOwn(input, "items") || Object.hasOwn(input, "taxAmount")) {
    const taxAmount = Object.hasOwn(input, "taxAmount")
      ? input.taxAmount
      : (await client.query("SELECT tax_amount::text FROM quotes WHERE id = $1", [quoteId])).rows[0]
          .tax_amount;
    const recalculated = await recalculateQuote(client, quoteId, taxAmount);
    if (!recalculated) {
      return { amountOverflow: true };
    }
  }
  return { id: quoteId, serviceRequestId: lock.rows[0].service_request_id };
}

async function submitQuote(client, quoteId, userId, providerOrganizationId) {
  const found = await client.query(
    `SELECT service_request_id
     FROM quotes
     WHERE id = $1 AND provider_organization_id = $2`,
    [quoteId, providerOrganizationId]
  );
  if (!found.rows[0]) {
    return null;
  }
  const request = await lockRequestForProviderQuote(
    client,
    found.rows[0].service_request_id,
    userId,
    providerOrganizationId
  );
  if (!request) {
    return null;
  }
  const lockedQuote = await client.query(
    `SELECT id FROM quotes WHERE id = $1 AND provider_organization_id = $2
       AND status = 'draft'
     FOR UPDATE`,
    [quoteId, providerOrganizationId]
  );
  if (!lockedQuote.rows[0]) {
    return null;
  }
  const updated = await client.query(
    `UPDATE quotes SET status = 'submitted', updated_at = NOW()
     WHERE id = $1 AND status = 'draft'
     RETURNING service_request_id`,
    [quoteId]
  );
  if (["submitted", "assigned"].includes(request.status)) {
    await client.query(
      `UPDATE service_requests SET status = 'quoted', updated_at = NOW()
       WHERE id = $1 AND status IN ('submitted', 'assigned')`,
      [updated.rows[0].service_request_id]
    );
  }
  await notifyOrganizationMembers(
    client,
    request.consumer_organization_id,
    userId,
    {
      type: "quote_submitted",
      title: "New quote received",
      message: "A provider submitted a quote for your service request.",
      relatedEntityType: "quote",
      relatedEntityId: quoteId,
    }
  );
  return { serviceRequestId: updated.rows[0].service_request_id };
}

async function lockRequestForQuote(client, requestId, consumerUserId) {
  const result = await client.query(
    `SELECT sr.id, sr.status, sr.consumer_organization_id,
            sr.provider_organization_id
     FROM service_requests sr
     JOIN organizations co ON co.id = sr.consumer_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om ON om.organization_id = co.id
       AND om.user_id = $2 AND om.status = 'active'
       AND om.role IN ('owner', 'admin', 'manager')
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.id = $1
     FOR UPDATE OF sr`,
    [requestId, consumerUserId]
  );
  return result.rows[0] || null;
}

async function lockRequestForProviderQuote(client, requestId, userId, providerOrganizationId) {
  const result = await client.query(
    `SELECT sr.id, sr.status
     FROM service_requests sr
     JOIN organizations po ON po.id = $3 AND po.organization_type = 'provider'
       AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $2 AND om.status = 'active'
       AND om.role IN ('owner', 'admin', 'manager')
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.id = $1 AND sr.status IN ('submitted', 'assigned', 'quoted')
       AND (sr.provider_organization_id IS NULL OR sr.provider_organization_id = po.id)
       AND (
         (sr.service_category_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           JOIN service_categories sc ON sc.id = ps.service_category_id AND sc.is_active = TRUE
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND ps.service_category_id = sr.service_category_id
         ))
         OR (sr.service_category_id IS NULL AND sr.service_type IS NOT NULL AND EXISTS (
           SELECT 1 FROM provider_services ps
           WHERE ps.provider_organization_id = po.id AND ps.is_active = TRUE
             AND lower(ps.name) = lower(sr.service_type)
         ))
       )
     FOR UPDATE OF sr`,
    [requestId, userId, providerOrganizationId]
  );
  return result.rows[0] || null;
}

async function decideQuote(client, quoteId, consumerUserId, decision) {
  const quoteInfo = await client.query(
    "SELECT service_request_id FROM quotes WHERE id = $1",
    [quoteId]
  );
  if (!quoteInfo.rows[0]) {
    return { missing: true };
  }
  const request = await lockRequestForQuote(client, quoteInfo.rows[0].service_request_id, consumerUserId);
  if (!request) {
    return { missing: true };
  }
  if (!["submitted", "quoted", "assigned"].includes(request.status)) {
    return { conflict: true, status: request.status };
  }

  const selected = await client.query(
    `SELECT id, status, valid_until, provider_organization_id,
            (valid_until IS NOT NULL AND valid_until < CURRENT_DATE) AS expired
     FROM quotes
     WHERE id = $1 AND service_request_id = $2
     FOR UPDATE`,
    [quoteId, request.id]
  );
  if (!selected.rows[0]) {
    return { missing: true };
  }
  if (selected.rows[0].status !== "submitted") {
    return { conflict: true, status: selected.rows[0].status };
  }
  if (decision === "accepted" && selected.rows[0].expired) {
    await client.query(
      "UPDATE quotes SET status = 'expired', updated_at = NOW() WHERE id = $1",
      [quoteId]
    );
    const remaining = await client.query(
      `SELECT 1 FROM quotes WHERE service_request_id = $1 AND status = 'submitted' LIMIT 1`,
      [request.id]
    );
    if (remaining.rowCount === 0 && request.status === "quoted") {
      await client.query(
        `UPDATE service_requests
         SET status = CASE WHEN provider_organization_id IS NULL THEN 'submitted' ELSE 'assigned' END,
             updated_at = NOW()
         WHERE id = $1 AND status = 'quoted'`,
        [request.id]
      );
    }
    return { conflict: true, status: "expired" };
  }

  await client.query(
    "UPDATE quotes SET status = $2, updated_at = NOW() WHERE id = $1",
    [quoteId, decision]
  );
  await notifyOrganizationMembers(
    client,
    selected.rows[0].provider_organization_id,
    consumerUserId,
    {
      type: decision === "accepted" ? "quote_accepted" : "quote_rejected",
      title: decision === "accepted" ? "Quote accepted" : "Quote rejected",
      message: decision === "accepted"
        ? "A consumer accepted your quote."
        : "A consumer rejected your quote.",
      relatedEntityType: "quote",
      relatedEntityId: quoteId,
    }
  );
  if (decision === "accepted") {
    const otherProviders = await client.query(
      `SELECT provider_organization_id FROM quotes
       WHERE service_request_id = $1 AND id <> $2 AND status = 'submitted'`,
      [request.id, quoteId]
    );
    await client.query(
      `UPDATE quotes
       SET status = CASE WHEN status = 'draft' THEN 'cancelled' ELSE 'rejected' END,
           updated_at = NOW()
       WHERE service_request_id = $1 AND id <> $2 AND status IN ('draft', 'submitted')`,
      [request.id, quoteId]
    );
    for (const quote of otherProviders.rows) {
      await notifyOrganizationMembers(client, quote.provider_organization_id, consumerUserId, {
        type: "quote_rejected",
        title: "Quote rejected",
        message: "Another quote was selected for this service request.",
        relatedEntityType: "quote",
        relatedEntityId: quoteId,
      });
    }
    await client.query(
      "UPDATE service_requests SET status = 'accepted', updated_at = NOW() WHERE id = $1",
      [request.id]
    );
  } else {
    const remaining = await client.query(
      `SELECT 1 FROM quotes WHERE service_request_id = $1 AND status = 'submitted' LIMIT 1`,
      [request.id]
    );
    if (remaining.rowCount === 0) {
      await client.query(
        `UPDATE service_requests
         SET status = CASE WHEN provider_organization_id IS NULL THEN 'submitted' ELSE 'assigned' END,
             updated_at = NOW()
         WHERE id = $1 AND status = 'quoted'`,
        [request.id]
      );
    }
  }
  return { quoteId };
}

async function listMessages(requestId) {
  const result = await pool.query(
    `SELECT m.id, m.service_request_id AS "serviceRequestId",
            m.sender_user_id AS "senderUserId",
            u.first_name AS "senderFirstName", u.last_name AS "senderLastName",
            m.message, m.created_at AS "createdAt"
     FROM service_request_messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.service_request_id = $1
     ORDER BY m.created_at, m.id`,
    [requestId]
  );
  return result.rows;
}

async function createMessage(userId, requestId, message) {
  const result = await pool.query(
    `INSERT INTO service_request_messages (service_request_id, sender_user_id, message)
     SELECT sr.id, u.id, $3
     FROM service_requests sr
     JOIN users u ON u.id = $2 AND u.status = 'active'
     WHERE sr.id = $1
       AND (
         EXISTS (
           SELECT 1 FROM organizations co
           JOIN organization_memberships om ON om.organization_id = co.id
             AND om.user_id = u.id AND om.status = 'active'
           WHERE co.id = sr.consumer_organization_id AND co.organization_type = 'consumer'
             AND co.status = 'active'
         )
         OR EXISTS (
           SELECT 1 FROM organization_memberships om
           JOIN organizations po ON po.id = om.organization_id
           JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
           WHERE om.user_id = u.id AND om.status = 'active'
             AND po.status = 'active' AND po.organization_type = 'provider'
             AND (
               po.id = sr.provider_organization_id
               OR EXISTS (
                 SELECT 1 FROM quotes q
                 WHERE q.service_request_id = sr.id AND q.provider_organization_id = po.id
               )
             )
         )
       )
     RETURNING id, service_request_id AS "serviceRequestId",
               sender_user_id AS "senderUserId", message, created_at AS "createdAt"`,
    [requestId, userId, message]
  );
  return result.rows[0] || null;
}

async function userCanAccessMessages(userId, requestId) {
  const result = await pool.query(
    `SELECT 1 FROM service_requests sr
     WHERE sr.id = $2 AND (
       EXISTS (
         SELECT 1 FROM organizations co
         JOIN organization_memberships om ON om.organization_id = co.id
           AND om.user_id = $1 AND om.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE co.id = sr.consumer_organization_id AND co.organization_type = 'consumer'
           AND co.status = 'active'
       )
       OR EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         JOIN organizations po ON po.id = om.organization_id
           AND po.organization_type = 'provider' AND po.status = 'active'
         JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND (
             po.id = sr.provider_organization_id
             OR EXISTS (
               SELECT 1 FROM quotes q
               WHERE q.service_request_id = sr.id
                 AND q.provider_organization_id = po.id
             )
           )
       )
     )`,
    [userId, requestId]
  );
  return result.rowCount === 1;
}

module.exports = {
  cancelRequest,
  createMessage,
  createQuote,
  createRequest,
  decideQuote,
  findActiveMemberships,
  getOwnedEligibleAsset,
  getQuoteById,
  getRequestById,
  getRequestForConsumer,
  getRequestForProvider,
  isActiveAdmin,
  isActiveCategory,
  isProviderEligibleForRequest,
  listAdminRequests,
  listConsumerRequests,
  listMessages,
  listProviderRequests,
  listRequestQuotes,
  lockRequestForQuote,
  lockRequestForProviderQuote,
  providerIsApproved,
  providerOffersRequest,
  submitQuote,
  updateConsumerRequest,
  updateDraftQuote,
  userCanAccessMessages,
};
