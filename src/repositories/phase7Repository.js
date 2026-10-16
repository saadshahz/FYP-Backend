const { pool } = require("../config/database");
const {
  notifyOrganizationMembers,
  notifyOrganizations,
  notifyUser,
} = require("./notificationRepository");

const writeRoles = ["owner", "admin", "manager"];

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

async function findMembership(userId, organizationId) {
  const result = await pool.query(
    `SELECT o.id, o.organization_type AS "organizationType", om.role
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'active'
     JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
     WHERE u.id = $1 AND u.status = 'active' AND o.id = $2`,
    [userId, organizationId]
  );
  return result.rows[0] || null;
}

async function isActiveAdmin(userId) {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND platform_role = 'admin'",
    [userId]
  );
  return result.rowCount === 1;
}

function contractColumns() {
  return `c.id, c.contract_number AS "contractNumber",
          c.service_request_id AS "serviceRequestId", c.quote_id AS "quoteId",
          c.consumer_organization_id AS "consumerOrganizationId",
          co.name AS "consumerOrganizationName",
          c.provider_organization_id AS "providerOrganizationId",
          po.name AS "providerOrganizationName", c.status, c.currency,
          c.total_amount AS "totalAmount", c.terms, c.start_date AS "startDate",
          c.end_date AS "endDate", c.sent_at AS "sentAt",
          c.accepted_at AS "acceptedAt", c.created_at AS "createdAt",
          c.updated_at AS "updatedAt"`;
}

async function getContractById(contractId) {
  const result = await pool.query(
    `SELECT ${contractColumns()},
            sr.request_number AS "requestNumber", sr.asset_id AS "assetId",
            a.name AS "assetName", q.status AS "quoteStatus",
            q.estimated_days AS "estimatedDays", q.valid_until AS "quoteValidUntil",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', qi.id, 'description', qi.description, 'quantity', qi.quantity,
                'unitPrice', qi.unit_price, 'lineTotal', qi.line_total
              ) ORDER BY qi.created_at, qi.id)
              FROM quote_items qi WHERE qi.quote_id = c.quote_id
            ), '[]'::jsonb) AS "quoteItems"
     FROM contracts c
     LEFT JOIN service_requests sr ON sr.id = c.service_request_id
     LEFT JOIN assets a ON a.id = sr.asset_id
     LEFT JOIN quotes q ON q.id = c.quote_id
     JOIN organizations co ON co.id = c.consumer_organization_id
     JOIN organizations po ON po.id = c.provider_organization_id
     WHERE c.id = $1`,
    [contractId]
  );
  return result.rows[0] || null;
}

async function getAccessibleContract(userId, contractId) {
  const result = await pool.query(
    `SELECT c.id
     FROM contracts c
     WHERE c.id = $2 AND (
       EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.id IN (c.consumer_organization_id, c.provider_organization_id)
       )
       OR EXISTS (
         SELECT 1 FROM users u
         WHERE u.id = $1 AND u.status = 'active' AND u.platform_role = 'admin'
       )
     )`,
    [userId, contractId]
  );
  return result.rowCount === 1;
}

function contractListFilters(filters, values) {
  if (!filters.status) {
    return "";
  }
  values.push(filters.status);
  return ` AND c.status = $${values.length}`;
}

async function listContracts(userId, organizationId, filters, admin) {
  if (admin) {
    const adminValues = [];
    const adminConditions = [];
    if (organizationId) {
      adminValues.push(organizationId);
      adminConditions.push(
        `(c.consumer_organization_id = $${adminValues.length} OR c.provider_organization_id = $${adminValues.length})`
      );
    }
    if (filters.status) {
      adminValues.push(filters.status);
      adminConditions.push(`c.status = $${adminValues.length}`);
    }
    const where = adminConditions.length ? ` WHERE ${adminConditions.join(" AND ")}` : "";
    const adminCount = await pool.query(
      `SELECT count(*)::int AS total FROM contracts c${where}`,
      adminValues
    );
    const paged = [...adminValues, filters.limit, (filters.page - 1) * filters.limit];
    const adminRows = await pool.query(
      `SELECT ${contractColumns()}
       FROM contracts c
       JOIN organizations co ON co.id = c.consumer_organization_id
       JOIN organizations po ON po.id = c.provider_organization_id
       ${where}
       ORDER BY c.created_at DESC, c.id
       LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
      paged
    );
    return { data: adminRows.rows, total: adminCount.rows[0].total };
  }

  const values = [userId];
  let scope = "";
  if (organizationId) {
    values.push(organizationId);
    scope = ` AND o.id = $${values.length}`;
  }
  const statusFilter = contractListFilters(filters, values);
  const membership = `JOIN organizations o ON o.id IN
                        (c.consumer_organization_id, c.provider_organization_id)
                      AND o.status = 'active'
                      JOIN organization_memberships om ON om.organization_id = o.id
                        AND om.user_id = $1 AND om.status = 'active'
                      JOIN users u ON u.id = om.user_id AND u.status = 'active'
                      WHERE TRUE${scope}`;
  const count = await pool.query(
    `SELECT count(DISTINCT c.id)::int AS total
     FROM contracts c ${membership}${statusFilter}`,
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT DISTINCT ${contractColumns()}
     FROM contracts c
     JOIN organizations o ON o.id IN (c.consumer_organization_id, c.provider_organization_id)
     JOIN organization_memberships om ON om.organization_id = o.id
       AND om.user_id = $1 AND om.status = 'active'
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     JOIN organizations co ON co.id = c.consumer_organization_id
     JOIN organizations po ON po.id = c.provider_organization_id
     WHERE TRUE${scope}${statusFilter}
     ORDER BY c.created_at DESC, c.id
     LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function lockAcceptedQuoteForContract(client, userId, quoteId) {
  const request = await client.query(
    `SELECT sr.id AS "requestId", sr.status AS "requestStatus",
            sr.consumer_organization_id AS "consumerOrganizationId",
            sr.provider_organization_id AS "targetProviderOrganizationId",
            q.id AS "quoteId", q.provider_organization_id AS "providerOrganizationId",
            q.status AS "quoteStatus", q.currency, q.total_amount AS "totalAmount"
     FROM service_requests sr
     JOIN quotes q ON q.service_request_id = sr.id
     JOIN organizations co ON co.id = sr.consumer_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om ON om.organization_id = co.id
       AND om.user_id = $1 AND om.status = 'active'
       AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     JOIN organizations po ON po.id = q.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     WHERE q.id = $2 AND q.status = 'accepted' AND sr.status = 'accepted'
       AND (sr.provider_organization_id IS NULL OR sr.provider_organization_id = po.id)
     FOR UPDATE OF sr`,
    [userId, quoteId, writeRoles]
  );
  if (!request.rows[0]) {
    return null;
  }
  const quote = await client.query(
    `SELECT id FROM quotes WHERE id = $1 AND service_request_id = $2
       AND status = 'accepted' FOR UPDATE`,
    [quoteId, request.rows[0].requestId]
  );
  if (!quote.rows[0]) {
    return null;
  }
  return request.rows[0];
}

async function createContract(client, userId, quoteId, contractNumber, input) {
  const accepted = await lockAcceptedQuoteForContract(client, userId, quoteId);
  if (!accepted) {
    return { unavailable: true };
  }
  const duplicate = await client.query(
    `SELECT 1 FROM contracts
     WHERE quote_id = $1
        OR (
          service_request_id = $2
          AND status NOT IN ('rejected', 'expired', 'cancelled', 'completed')
        )
     LIMIT 1`,
    [quoteId, accepted.requestId]
  );
  if (duplicate.rowCount > 0) {
    return { duplicate: true };
  }
  await client.query(
    `UPDATE service_requests SET provider_organization_id = $2, updated_at = NOW()
     WHERE id = $1 AND provider_organization_id IS NULL`,
    [accepted.requestId, accepted.providerOrganizationId]
  );
  const result = await client.query(
    `INSERT INTO contracts
       (contract_number, service_request_id, quote_id, consumer_organization_id,
        provider_organization_id, status, currency, total_amount, terms, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7::numeric, $8, $9, $10)
     RETURNING id`,
    [
      contractNumber,
      accepted.requestId,
      quoteId,
      accepted.consumerOrganizationId,
      accepted.providerOrganizationId,
      accepted.currency,
      accepted.totalAmount,
      input.terms,
      input.startDate,
      input.endDate,
    ]
  );
  return { id: result.rows[0].id };
}

async function updateDraftContract(client, userId, contractId, input) {
  const values = [];
  const assignments = [];
  const columns = { terms: "terms", startDate: "start_date", endDate: "end_date" };
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(contractId, userId, writeRoles);
  const result = await client.query(
    `UPDATE contracts c
     SET ${assignments.join(", ")}
     WHERE c.id = $${values.length - 2} AND c.status = 'draft'
       AND EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $${values.length - 1} AND om.status = 'active'
           AND om.role = ANY($${values.length}::text[])
           AND o.id = c.consumer_organization_id
       )
     RETURNING c.id`,
    values
  );
  return result.rowCount === 1;
}

async function transitionContract(client, userId, contractId, action) {
  const side = action === "send" || action === "complete"
    ? "consumer"
    : action === "accept"
      ? "provider"
      : null;
  const lock = await client.query(
    `SELECT c.id, c.status, c.service_request_id,
            c.consumer_organization_id, c.provider_organization_id
     FROM contracts c
     WHERE c.id = $2 AND (
       (
         $3::text IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
           JOIN users u ON u.id = om.user_id AND u.status = 'active'
           WHERE om.user_id = $1 AND om.status = 'active'
             AND om.role = ANY($4::text[])
             AND o.organization_type = $3
             AND o.id = CASE WHEN $3 = 'consumer'
                       THEN c.consumer_organization_id ELSE c.provider_organization_id END
         )
       )
       OR (
         $3::text IS NULL
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
           JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
           JOIN users u ON u.id = om.user_id AND u.status = 'active'
           WHERE om.user_id = $1 AND om.status = 'active'
             AND om.role = ANY($4::text[])
             AND o.id IN (c.consumer_organization_id, c.provider_organization_id)
         )
       )
     )
     FOR UPDATE OF c`,
    [userId, contractId, side, writeRoles]
  );
  if (!lock.rows[0]) {
    return { missing: true };
  }
  const transitions = {
    send: { from: ["draft"], to: "sent", timestamp: "sent_at" },
    accept: { from: ["sent"], to: "accepted", timestamp: "accepted_at" },
    activate: { from: ["accepted"], to: "active" },
    complete: { from: ["active"], to: "completed" },
    cancel: { from: ["draft", "sent", "accepted", "active"], to: "cancelled" },
  };
  const transition = transitions[action];
  if (!transition.from.includes(lock.rows[0].status)) {
    return { conflict: true, status: lock.rows[0].status };
  }
  if (action === "complete") {
    const completedWorkOrder = await client.query(
      `SELECT 1 FROM work_orders
       WHERE service_request_id = $1 AND provider_organization_id = $2
         AND status = 'completed'
       LIMIT 1`,
      [lock.rows[0].service_request_id, lock.rows[0].provider_organization_id]
    );
    if (completedWorkOrder.rowCount === 0) {
      return { conflict: true, status: "work_not_completed" };
    }
  }
  if (action === "cancel" && lock.rows[0].status === "active") {
    const completedWorkOrder = await client.query(
      `SELECT 1 FROM work_orders
       WHERE service_request_id = $1 AND provider_organization_id = $2
         AND status = 'completed'
       LIMIT 1`,
      [lock.rows[0].service_request_id, lock.rows[0].provider_organization_id]
    );
    if (completedWorkOrder.rowCount > 0) {
      return { conflict: true, status: "work_completed" };
    }
    const activeWorkOrder = await client.query(
      `SELECT 1 FROM work_orders
       WHERE service_request_id = $1 AND provider_organization_id = $2
         AND status IN ('pending', 'scheduled', 'in_progress')
       LIMIT 1`,
      [lock.rows[0].service_request_id, lock.rows[0].provider_organization_id]
    );
    if (activeWorkOrder.rowCount > 0) {
      return { conflict: true, status: "work_order_in_progress" };
    }
  }
  const timestamp = transition.timestamp ? `, ${transition.timestamp} = NOW()` : "";
  const result = await client.query(
    `UPDATE contracts SET status = $2${timestamp}, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [contractId, transition.to]
  );
  const recipientOrganizationId = action === "send" || action === "activate" || action === "complete"
    ? lock.rows[0].provider_organization_id
    : action === "accept"
      ? lock.rows[0].consumer_organization_id
      : null;
  const notification = {
    type: `contract_${action === "activate" ? "activated" : action === "complete" ? "completed" : action === "cancel" ? "cancelled" : action === "accept" ? "accepted" : "sent"}`,
    title: `Contract ${action === "activate" ? "activated" : action === "complete" ? "completed" : action === "cancel" ? "cancelled" : action === "accept" ? "accepted" : "sent"}`,
    message: `A contract was ${action === "activate" ? "activated" : action === "complete" ? "completed" : action === "cancel" ? "cancelled" : action === "accept" ? "accepted" : "sent"}.`,
    relatedEntityType: "contract",
    relatedEntityId: contractId,
  };
  if (action === "cancel") {
    await notifyOrganizations(
      client,
      [lock.rows[0].consumer_organization_id, lock.rows[0].provider_organization_id],
      userId,
      notification
    );
  } else {
    await notifyOrganizationMembers(client, recipientOrganizationId, userId, notification);
  }
  return { id: result.rows[0].id, status: transition.to };
}

function workOrderColumns() {
  return `wo.id, wo.work_order_number AS "workOrderNumber",
          wo.service_request_id AS "serviceRequestId",
          sr.request_number AS "requestNumber",
          sr.consumer_organization_id AS "consumerOrganizationId",
          co.name AS "consumerOrganizationName",
          wo.provider_organization_id AS "providerOrganizationId",
          po.name AS "providerOrganizationName",
          wo.asset_id AS "assetId", a.name AS "assetName",
          wo.assigned_to_user_id AS "assignedToUserId",
          assigned.first_name AS "technicianFirstName",
          assigned.last_name AS "technicianLastName",
          wo.status, wo.priority, wo.scheduled_start_at AS "scheduledStartAt",
          wo.scheduled_end_at AS "scheduledEndAt", wo.completed_at AS "completedAt",
          wo.estimated_cost AS "estimatedCost", wo.actual_cost AS "actualCost",
          wo.notes, wo.created_at AS "createdAt", wo.updated_at AS "updatedAt"`;
}

async function getWorkOrderById(workOrderId) {
  const result = await pool.query(
    `SELECT ${workOrderColumns()},
            c.id AS "contractId", c.contract_number AS "contractNumber",
            c.status AS "contractStatus"
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     JOIN organizations co ON co.id = sr.consumer_organization_id
     JOIN organizations po ON po.id = wo.provider_organization_id
     LEFT JOIN assets a ON a.id = wo.asset_id
     LEFT JOIN users assigned ON assigned.id = wo.assigned_to_user_id
     LEFT JOIN LATERAL (
       SELECT c0.id, c0.contract_number, c0.status
       FROM contracts c0
       WHERE c0.service_request_id = wo.service_request_id
         AND c0.provider_organization_id = wo.provider_organization_id
       ORDER BY c0.created_at DESC, c0.id
       LIMIT 1
     ) c ON TRUE
     WHERE wo.id = $1`,
    [workOrderId]
  );
  return result.rows[0] || null;
}

async function getAccessibleWorkOrder(userId, workOrderId) {
  const result = await pool.query(
    `SELECT wo.id, wo.provider_organization_id AS "providerOrganizationId",
            sr.consumer_organization_id AS "consumerOrganizationId"
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     WHERE wo.id = $2 AND (
       EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.id IN (wo.provider_organization_id, sr.consumer_organization_id)
       )
       OR EXISTS (
         SELECT 1 FROM users u WHERE u.id = $1
           AND u.status = 'active' AND u.platform_role = 'admin'
       )
     )`,
    [userId, workOrderId]
  );
  return result.rows[0] || null;
}

function workOrderListFilters(filters, values) {
  if (!filters.status) {
    return "";
  }
  values.push(filters.status);
  return ` AND wo.status = $${values.length}`;
}

async function listWorkOrders(userId, organizationId, filters, admin) {
  if (admin) {
    const values = [];
    const conditions = [];
    if (organizationId) {
      values.push(organizationId);
      conditions.push(
        `(wo.provider_organization_id = $${values.length} OR sr.consumer_organization_id = $${values.length})`
      );
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`wo.status = $${values.length}`);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM work_orders wo
       JOIN service_requests sr ON sr.id = wo.service_request_id${where}`,
      values
    );
    const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
    const rows = await pool.query(
      `SELECT ${workOrderColumns()}
       FROM work_orders wo
       JOIN service_requests sr ON sr.id = wo.service_request_id
       JOIN organizations co ON co.id = sr.consumer_organization_id
       JOIN organizations po ON po.id = wo.provider_organization_id
       LEFT JOIN assets a ON a.id = wo.asset_id
       LEFT JOIN users assigned ON assigned.id = wo.assigned_to_user_id
       ${where}
       ORDER BY wo.created_at DESC, wo.id
       LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
      paged
    );
    return { data: rows.rows, total: count.rows[0].total };
  }

  const membership = await findMembership(userId, organizationId);
  if (!membership) {
    return null;
  }
  const values = [organizationId];
  const scope = membership.organizationType === "provider"
    ? "wo.provider_organization_id = $1"
    : "sr.consumer_organization_id = $1";
  const statusFilter = workOrderListFilters(filters, values);
  const count = await pool.query(
    `SELECT count(*)::int AS total
     FROM work_orders wo JOIN service_requests sr ON sr.id = wo.service_request_id
     WHERE ${scope}${statusFilter}`,
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT ${workOrderColumns()}
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     JOIN organizations co ON co.id = sr.consumer_organization_id
     JOIN organizations po ON po.id = wo.provider_organization_id
     LEFT JOIN assets a ON a.id = wo.asset_id
     LEFT JOIN users assigned ON assigned.id = wo.assigned_to_user_id
     WHERE ${scope}${statusFilter}
     ORDER BY wo.created_at DESC, wo.id
     LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total, organizationType: membership.organizationType };
}

async function lockActiveContractForWorkOrder(client, userId, contractId) {
  const result = await client.query(
    `SELECT c.id, c.service_request_id AS "serviceRequestId",
            c.provider_organization_id AS "providerOrganizationId",
            c.consumer_organization_id AS "consumerOrganizationId",
            sr.asset_id AS "assetId", sr.status AS "requestStatus"
     FROM contracts c
     JOIN service_requests sr ON sr.id = c.service_request_id
     JOIN organizations po ON po.id = c.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $1 AND om.status = 'active'
       AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE c.id = $2 AND c.status = 'active' AND sr.status = 'accepted'
       AND sr.provider_organization_id = po.id
     FOR UPDATE OF c, sr`,
    [userId, contractId, writeRoles]
  );
  return result.rows[0] || null;
}

async function createWorkOrder(client, userId, contractId, workOrderNumber, input) {
  const contract = await lockActiveContractForWorkOrder(client, userId, contractId);
  if (!contract) {
    return { unavailable: true };
  }
  const existing = await client.query(
    `SELECT 1 FROM work_orders
     WHERE service_request_id = $1 AND provider_organization_id = $2
     LIMIT 1`,
    [contract.serviceRequestId, contract.providerOrganizationId]
  );
  if (existing.rowCount > 0) {
    return { duplicate: true };
  }
  const result = await client.query(
    `INSERT INTO work_orders
       (work_order_number, service_request_id, asset_id, provider_organization_id,
        status, priority, scheduled_start_at, scheduled_end_at, estimated_cost, notes)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8::numeric, $9)
     RETURNING id`,
    [
      workOrderNumber,
      contract.serviceRequestId,
      contract.assetId,
      contract.providerOrganizationId,
      input.priority,
      input.scheduledStartAt,
      input.scheduledEndAt,
      input.estimatedCost,
      input.notes,
    ]
  );
  await appendWorkOrderEvent(client, result.rows[0].id, userId, null, "pending", "Work order created.");
  await notifyOrganizationMembers(client, contract.consumerOrganizationId, userId, {
    type: "work_order_created",
    title: "Work order created",
    message: "A provider created a work order for your service request.",
    relatedEntityType: "work_order",
    relatedEntityId: result.rows[0].id,
  });
  return { id: result.rows[0].id };
}

async function lockWritableWorkOrder(client, userId, workOrderId) {
  const result = await client.query(
    `SELECT wo.*, sr.consumer_organization_id AS consumer_organization_id
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     WHERE wo.id = $2 AND EXISTS (
       SELECT 1 FROM organization_memberships om
       JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
       JOIN users u ON u.id = om.user_id AND u.status = 'active'
       WHERE om.user_id = $1 AND om.status = 'active'
         AND om.role = ANY($3::text[]) AND o.id = wo.provider_organization_id
     ) AND EXISTS (
       SELECT 1 FROM contracts c
       WHERE c.service_request_id = wo.service_request_id
         AND c.provider_organization_id = wo.provider_organization_id
         AND c.status = 'active'
     )
     FOR UPDATE OF wo`,
    [userId, workOrderId, writeRoles]
  );
  return result.rows[0] || null;
}

async function updateWorkOrder(client, userId, workOrderId, input) {
  const workOrder = await lockWritableWorkOrder(client, userId, workOrderId);
  if (!workOrder) {
    return { missing: true };
  }
  if (!["pending", "scheduled"].includes(workOrder.status)) {
    return { conflict: true, status: workOrder.status };
  }
  const values = [];
  const assignments = [];
  const columns = {
    priority: "priority",
    scheduledStartAt: "scheduled_start_at",
    scheduledEndAt: "scheduled_end_at",
    estimatedCost: "estimated_cost",
    notes: "notes",
  };
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}${field === "estimatedCost" ? "::numeric" : ""}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(workOrderId);
  await client.query(
    `UPDATE work_orders SET ${assignments.join(", ")} WHERE id = $${values.length}`,
    values
  );
  return { id: workOrderId };
}

async function technicianBelongsToProvider(client, technicianId, providerOrganizationId) {
  const result = await client.query(
    `SELECT 1
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id
       AND om.organization_id = $2 AND om.status = 'active' AND om.role = 'technician'
     JOIN organizations o ON o.id = om.organization_id
       AND o.organization_type = 'provider' AND o.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = o.id AND pp.status = 'approved'
     WHERE u.id = $1 AND u.status = 'active'`,
    [technicianId, providerOrganizationId]
  );
  return result.rowCount === 1;
}

async function assignTechnician(client, userId, workOrderId, input) {
  const workOrder = await lockWritableWorkOrder(client, userId, workOrderId);
  if (!workOrder) {
    return { missing: true };
  }
  if (!["pending", "scheduled"].includes(workOrder.status)) {
    return { conflict: true, status: workOrder.status };
  }
  if (!(await technicianBelongsToProvider(client, input.technicianId, workOrder.provider_organization_id))) {
    return { invalidTechnician: true };
  }
  const startAt = input.scheduledStartAt ?? workOrder.scheduled_start_at;
  const endAt = input.scheduledEndAt ?? workOrder.scheduled_end_at;
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
    return { invalidSchedule: true };
  }
  const updated = await client.query(
    `UPDATE work_orders
     SET assigned_to_user_id = $2, status = 'scheduled',
         scheduled_start_at = COALESCE($3, scheduled_start_at),
         scheduled_end_at = COALESCE($4, scheduled_end_at),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [workOrderId, input.technicianId, input.scheduledStartAt, input.scheduledEndAt]
  );
  const oldStatus = workOrder.status;
  const note = input.note || "Technician assigned.";
  await appendWorkOrderEvent(client, workOrderId, userId, oldStatus, "scheduled", note);
  await notifyUser(client, input.technicianId, {
    type: "work_order_assigned",
    title: "Work order assigned",
    message: "A work order was assigned to you.",
    relatedEntityType: "work_order",
    relatedEntityId: workOrderId,
  });
  return { id: updated.rows[0].id };
}

async function appendWorkOrderEvent(client, workOrderId, actorUserId, oldStatus, newStatus, note) {
  await client.query(
    `INSERT INTO work_order_events
       (work_order_id, actor_user_id, old_status, new_status, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [workOrderId, actorUserId, oldStatus, newStatus, note]
  );
}

async function lockWorkOrderForAction(client, userId, workOrderId, action) {
  const isConsumerCancel = action === "cancel";
  const membershipClause = isConsumerCancel
    ? `(
         (o.id = wo.provider_organization_id AND o.organization_type = 'provider'
           AND om.role = ANY($3::text[]))
         OR
         (o.id = sr.consumer_organization_id AND o.organization_type = 'consumer'
           AND om.role = ANY($3::text[]))
       )`
    : `o.id = wo.provider_organization_id AND o.organization_type = 'provider'
       AND om.role = ANY($3::text[])`;
  const technicianClause = ["start", "complete"].includes(action)
    ? `OR (
         wo.assigned_to_user_id = $1
         AND EXISTS (
           SELECT 1 FROM organization_memberships tech
           JOIN users tu ON tu.id = tech.user_id AND tu.status = 'active'
           JOIN organizations tech_org ON tech_org.id = tech.organization_id
             AND tech_org.organization_type = 'provider' AND tech_org.status = 'active'
           JOIN provider_profiles tech_profile ON tech_profile.organization_id = tech_org.id
             AND tech_profile.status = 'approved'
           WHERE tech.user_id = $1 AND tech.organization_id = wo.provider_organization_id
             AND tech.status = 'active' AND tech.role = 'technician'
         )
       )`
    : "";
  const activeContractClause = action === "cancel"
    ? ""
    : `AND EXISTS (
         SELECT 1 FROM contracts c
         WHERE c.service_request_id = wo.service_request_id
           AND c.provider_organization_id = wo.provider_organization_id
           AND c.status = 'active'
       )`;
  const result = await client.query(
    `SELECT wo.*, sr.consumer_organization_id AS consumer_organization_id,
            sr.status AS request_status
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     WHERE wo.id = $2 ${activeContractClause} AND (
       EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active' AND ${membershipClause}
       )
       ${technicianClause}
     )
     FOR UPDATE OF wo`,
    [userId, workOrderId, writeRoles]
  );
  return result.rows[0] || null;
}

async function transitionWorkOrder(client, userId, workOrderId, action, input) {
  const workOrder = await lockWorkOrderForAction(client, userId, workOrderId, action);
  if (!workOrder) {
    return { missing: true };
  }
  const rules = {
    start: { from: ["scheduled"], to: "in_progress", note: "Work started." },
    complete: { from: ["in_progress"], to: "completed", note: "Work completed." },
    cancel: { from: ["pending", "scheduled", "in_progress"], to: "cancelled", note: "Work order cancelled." },
  };
  const rule = rules[action];
  if (!rule.from.includes(workOrder.status)) {
    return { conflict: true, status: workOrder.status };
  }
  if (action === "start" && !workOrder.assigned_to_user_id) {
    return { conflict: true, status: "unassigned" };
  }

  const assignments = ["status = $1", "updated_at = NOW()"];
  const values = [rule.to];
  if (action === "complete") {
    assignments.push("completed_at = NOW()");
    if (Object.hasOwn(input, "actualCost")) {
      values.push(input.actualCost);
      assignments.push(`actual_cost = $${values.length}::numeric`);
    }
  }
  if (action === "complete" && Object.hasOwn(input, "note")) {
    values.push(input.note);
    assignments.push(`notes = $${values.length}`);
  }
  values.push(workOrderId);
  await client.query(
    `UPDATE work_orders SET ${assignments.join(", ")} WHERE id = $${values.length}`,
    values
  );
  if (action === "start") {
    await client.query(
      `UPDATE service_requests SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND status = 'accepted'`,
      [workOrder.service_request_id]
    );
  } else if (action === "complete") {
    await client.query(
      `UPDATE service_requests SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND status IN ('accepted', 'in_progress')`,
      [workOrder.service_request_id]
    );
  } else if (action === "cancel" && workOrder.request_status === "in_progress") {
    await client.query(
      `UPDATE service_requests SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND status = 'in_progress'`,
      [workOrder.service_request_id]
    );
  }
  const eventNote = input.note || rule.note;
  await appendWorkOrderEvent(client, workOrderId, userId, workOrder.status, rule.to, eventNote);
  const notification = {
    type: `work_order_${action === "start" ? "started" : action === "complete" ? "completed" : "cancelled"}`,
    title: `Work order ${action === "start" ? "started" : action === "complete" ? "completed" : "cancelled"}`,
    message: `A work order was ${action === "start" ? "started" : action === "complete" ? "completed" : "cancelled"}.`,
    relatedEntityType: "work_order",
    relatedEntityId: workOrderId,
  };
  if (action === "cancel") {
    await notifyOrganizations(
      client,
      [workOrder.consumer_organization_id, workOrder.provider_organization_id],
      userId,
      notification
    );
  } else {
    await notifyOrganizationMembers(client, workOrder.consumer_organization_id, userId, notification);
  }
  return { id: workOrderId, status: rule.to };
}

async function listWorkOrderEvents(workOrderId) {
  const result = await pool.query(
    `SELECT e.id, e.work_order_id AS "workOrderId", e.actor_user_id AS "actorUserId",
            e.old_status AS "oldStatus", e.new_status AS "newStatus", e.note,
            e.created_at AS "createdAt", u.first_name AS "actorFirstName",
            u.last_name AS "actorLastName"
     FROM work_order_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.work_order_id = $1
     ORDER BY e.created_at, e.id`,
    [workOrderId]
  );
  return result.rows;
}

module.exports = {
  appendWorkOrderEvent,
  assignTechnician,
  createContract,
  createWorkOrder,
  findActiveMemberships,
  findMembership,
  getAccessibleContract,
  getAccessibleWorkOrder,
  getContractById,
  getWorkOrderById,
  isActiveAdmin,
  listContracts,
  listWorkOrderEvents,
  listWorkOrders,
  lockAcceptedQuoteForContract,
  technicianBelongsToProvider,
  transitionContract,
  transitionWorkOrder,
  updateDraftContract,
  updateWorkOrder,
};
