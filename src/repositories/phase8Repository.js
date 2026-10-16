const { pool } = require("../config/database");
const { notifyOrganizationMembers } = require("./notificationRepository");

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

function invoiceSelect() {
  return `SELECT i.id, i.invoice_number AS "invoiceNumber",
          i.service_request_id AS "serviceRequestId",
          i.work_order_id AS "workOrderId",
          wo.work_order_number AS "workOrderNumber",
          i.contract_id AS "contractId",
          c.contract_number AS "contractNumber",
          i.consumer_organization_id AS "consumerOrganizationId",
          co.name AS "consumerOrganizationName",
          i.provider_organization_id AS "providerOrganizationId",
          po.name AS "providerOrganizationName",
          i.status, i.currency, i.subtotal, i.tax_rate AS "taxRate",
          i.tax_amount AS "taxAmount", i.total_amount AS "totalAmount",
          COALESCE((
            SELECT SUM(p.amount) FROM payments p
            WHERE p.invoice_id = i.id AND p.status = 'completed'
          ), 0)::numeric(12,2) AS "amountPaid",
          GREATEST(i.total_amount - COALESCE((
            SELECT SUM(p.amount) FROM payments p
            WHERE p.invoice_id = i.id AND p.status = 'completed'
          ), 0), 0)::numeric(12,2) AS "amountDue",
          i.issued_at AS "issuedAt", i.due_at AS "dueAt", i.paid_at AS "paidAt",
          i.notes, i.created_at AS "createdAt", i.updated_at AS "updatedAt",
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', ii.id, 'description', ii.description, 'quantity', ii.quantity::text,
              'unitPrice', ii.unit_price::text, 'lineTotal', ii.line_total::text
            ) ORDER BY ii.created_at, ii.id)
            FROM invoice_items ii WHERE ii.invoice_id = i.id
          ), '[]'::jsonb) AS items`;
}

function invoiceJoins() {
  return `FROM invoices i
          JOIN organizations co ON co.id = i.consumer_organization_id
          JOIN organizations po ON po.id = i.provider_organization_id
          LEFT JOIN work_orders wo ON wo.id = i.work_order_id
          LEFT JOIN contracts c ON c.id = i.contract_id`;
}

async function getInvoiceById(invoiceId) {
  const result = await pool.query(
    `${invoiceSelect()} ${invoiceJoins()} WHERE i.id = $1`,
    [invoiceId]
  );
  return result.rows[0] || null;
}

async function getAccessibleInvoice(userId, invoiceId) {
  const result = await pool.query(
    `SELECT i.id FROM invoices i
     WHERE i.id = $2 AND (
       EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.id IN (i.consumer_organization_id, i.provider_organization_id)
       )
       OR EXISTS (
         SELECT 1 FROM users u WHERE u.id = $1
           AND u.status = 'active' AND u.platform_role = 'admin'
       )
     )`,
    [userId, invoiceId]
  );
  return result.rowCount === 1;
}

function addInvoiceConditions(filters, values, alias = "i") {
  const conditions = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`${alias}.status = $${values.length}`);
  }
  return conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
}

async function listInvoices(userId, organizationId, filters, admin) {
  if (admin && !organizationId) {
    const values = [];
    const extra = addInvoiceConditions(filters, values);
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM invoices i WHERE TRUE${extra}`,
      values
    );
    const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
    const rows = await pool.query(
      `${invoiceSelect()} ${invoiceJoins()}
       WHERE TRUE${extra}
       ORDER BY i.created_at DESC, i.id
       LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
      paged
    );
    return { data: rows.rows, total: count.rows[0].total };
  }
  if (admin && organizationId) {
    const values = [organizationId];
    const extra = addInvoiceConditions(filters, values);
    const scope = `i.consumer_organization_id = $1 OR i.provider_organization_id = $1`;
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM invoices i WHERE (${scope})${extra}`,
      values
    );
    const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
    const rows = await pool.query(
      `${invoiceSelect()} ${invoiceJoins()}
       WHERE (${scope})${extra}
       ORDER BY i.created_at DESC, i.id
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
  const scope = membership.organizationType === "consumer"
    ? "i.consumer_organization_id = $1"
    : membership.organizationType === "provider"
      ? "i.provider_organization_id = $1"
      : null;
  if (!scope) {
    return { data: [], total: 0 };
  }
  const extra = addInvoiceConditions(filters, values);
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM invoices i WHERE ${scope}${extra}`,
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `${invoiceSelect()} ${invoiceJoins()}
     WHERE ${scope}${extra}
     ORDER BY i.created_at DESC, i.id
     LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function lockBillableWorkOrder(client, userId, workOrderId) {
  const result = await client.query(
    `SELECT wo.id AS "workOrderId", wo.service_request_id AS "serviceRequestId",
            wo.provider_organization_id AS "providerOrganizationId",
            wo.asset_id AS "assetId", sr.consumer_organization_id AS "consumerOrganizationId",
            c.id AS "contractId", c.currency, c.status AS "contractStatus"
     FROM work_orders wo
     JOIN service_requests sr ON sr.id = wo.service_request_id
     JOIN contracts c ON c.service_request_id = sr.id
       AND c.provider_organization_id = wo.provider_organization_id
       AND c.consumer_organization_id = sr.consumer_organization_id
     JOIN organizations co ON co.id = sr.consumer_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organizations po ON po.id = wo.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $1 AND om.status = 'active' AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE wo.id = $2 AND wo.status = 'completed'
       AND sr.status = 'completed' AND c.status IN ('active', 'completed')
     FOR UPDATE OF wo`,
    [userId, workOrderId, writeRoles]
  );
  return result.rows.length === 1 ? result.rows[0] : null;
}

async function createInvoice(client, userId, workOrderId, invoiceNumber, input) {
  const relationship = await lockBillableWorkOrder(client, userId, workOrderId);
  if (!relationship) {
    return { unavailable: true };
  }
  const existing = await client.query(
    `SELECT 1 FROM invoices
     WHERE work_order_id = $1 AND status <> 'cancelled'
     LIMIT 1`,
    [workOrderId]
  );
  if (existing.rowCount > 0) {
    return { duplicate: true };
  }
  const inserted = await client.query(
    `INSERT INTO invoices
       (invoice_number, service_request_id, work_order_id, contract_id,
        consumer_organization_id, provider_organization_id, currency,
        tax_rate, due_at, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9, $10, 'draft')
     RETURNING id`,
    [
      invoiceNumber,
      relationship.serviceRequestId,
      relationship.workOrderId,
      relationship.contractId,
      relationship.consumerOrganizationId,
      relationship.providerOrganizationId,
      relationship.currency,
      input.taxRate,
      input.dueAt,
      input.notes,
    ]
  );
  await replaceInvoiceItems(client, inserted.rows[0].id, input.items);
  if (!(await recalculateInvoice(client, inserted.rows[0].id, input.taxRate))) {
    return { amountOverflow: true };
  }
  return { id: inserted.rows[0].id, currency: relationship.currency };
}

async function replaceInvoiceItems(client, invoiceId, items) {
  await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [invoiceId]);
  for (const item of items) {
    await client.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
       VALUES ($1, $2, $3::numeric, $4::numeric,
               ROUND($3::numeric * $4::numeric, 2))`,
      [invoiceId, item.description, item.quantity, item.unitPrice]
    );
  }
}

async function recalculateInvoice(client, invoiceId, taxRate) {
  const result = await client.query(
    `UPDATE invoices i
     SET subtotal = totals.subtotal,
         tax_rate = $2::numeric,
         tax_amount = ROUND(totals.subtotal * $2::numeric / 100, 2),
         total_amount = totals.subtotal + ROUND(totals.subtotal * $2::numeric / 100, 2),
         updated_at = NOW()
     FROM (
       SELECT COALESCE(SUM(line_total), 0) AS subtotal
       FROM invoice_items WHERE invoice_id = $1
     ) totals
     WHERE i.id = $1
       AND totals.subtotal <= 9999999999.99
       AND totals.subtotal + ROUND(totals.subtotal * $2::numeric / 100, 2)
           <= 9999999999.99`,
    [invoiceId, taxRate]
  );
  return result.rowCount === 1;
}

async function updateDraftInvoice(client, userId, invoiceId, input) {
  const invoice = await client.query(
    `SELECT i.id, i.tax_rate::text AS "taxRate"
     FROM invoices i
     JOIN organizations po ON po.id = i.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $2 AND om.status = 'active' AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE i.id = $1 AND i.status = 'draft'
     FOR UPDATE OF i`,
    [invoiceId, userId, writeRoles]
  );
  if (!invoice.rows[0]) {
    return null;
  }
  const assignments = [];
  const values = [];
  const columns = { taxRate: "tax_rate", dueAt: "due_at", notes: "notes" };
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}${field === "taxRate" ? "::numeric" : ""}`);
    }
  }
  if (assignments.length) {
    assignments.push("updated_at = NOW()");
    values.push(invoiceId);
    await client.query(
      `UPDATE invoices SET ${assignments.join(", ")} WHERE id = $${values.length}`,
      values
    );
  }
  if (Object.hasOwn(input, "items")) {
    await replaceInvoiceItems(client, invoiceId, input.items);
  }
  if (Object.hasOwn(input, "items") || Object.hasOwn(input, "taxRate")) {
    const rate = Object.hasOwn(input, "taxRate") ? input.taxRate : invoice.rows[0].taxRate;
    if (!(await recalculateInvoice(client, invoiceId, rate))) {
      return { amountOverflow: true };
    }
  }
  return { id: invoiceId };
}

async function transitionInvoice(client, userId, invoiceId, action) {
  const lock = await client.query(
    `SELECT i.id, i.status, i.due_at AS "dueAt", i.total_amount AS "totalAmount",
            i.consumer_organization_id AS "consumerOrganizationId"
     FROM invoices i
     JOIN organizations po ON po.id = i.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $2 AND om.status = 'active' AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE i.id = $1
     FOR UPDATE OF i`,
    [invoiceId, userId, writeRoles]
  );
  if (!lock.rows[0]) {
    return { missing: true };
  }
  if (action === "issue") {
    if (lock.rows[0].status !== "draft") {
      return { conflict: true, status: lock.rows[0].status };
    }
    if (!lock.rows[0].dueAt) {
      return { invalidDueDate: true };
    }
    const dueDate = await client.query(
      "SELECT $1::timestamptz > NOW() AS is_future",
      [lock.rows[0].dueAt]
    );
    if (!dueDate.rows[0].is_future) {
      return { invalidDueDate: true };
    }
    if (Number(lock.rows[0].totalAmount) <= 0) {
      return { emptyInvoice: true };
    }
    const result = await client.query(
      `UPDATE invoices SET status = 'issued', issued_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [invoiceId]
    );
    await notifyOrganizationMembers(client, lock.rows[0].consumerOrganizationId, userId, {
      type: "invoice_issued",
      title: "Invoice issued",
      message: "A provider issued an invoice for your completed work.",
      relatedEntityType: "invoice",
      relatedEntityId: invoiceId,
    });
    return { id: result.rows[0].id };
  }
  if (action === "cancel") {
    if (!["draft", "issued"].includes(lock.rows[0].status)) {
      return { conflict: true, status: lock.rows[0].status };
    }
    const payments = await client.query(
      "SELECT 1 FROM payments WHERE invoice_id = $1 LIMIT 1",
      [invoiceId]
    );
    if (payments.rowCount > 0) {
      return { conflict: true, status: "has_payments" };
    }
    const result = await client.query(
      `UPDATE invoices SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [invoiceId]
    );
    return { id: result.rows[0].id };
  }
  return { missing: true };
}

async function createPayment(client, userId, invoiceId, input) {
  const invoice = await client.query(
    `SELECT i.id, i.status, i.currency, i.total_amount AS "totalAmount",
            i.consumer_organization_id AS "consumerOrganizationId",
            i.provider_organization_id AS "providerOrganizationId"
     FROM invoices i
     JOIN organizations co ON co.id = i.consumer_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om ON om.organization_id = co.id
       AND om.user_id = $2 AND om.status = 'active' AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE i.id = $1
     FOR UPDATE OF i`,
    [invoiceId, userId, writeRoles]
  );
  if (!invoice.rows[0]) {
    return { missing: true };
  }
  const row = invoice.rows[0];
  if (!["issued", "partially_paid", "overdue"].includes(row.status)) {
    return { conflict: true, status: row.status };
  }
  const currency = input.currency || row.currency;
  if (currency !== row.currency) {
    return { currencyMismatch: true, currency: row.currency };
  }
  const balance = await client.query(
    `SELECT (i.total_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0))::numeric(12,2) AS balance
     FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE i.id = $1 GROUP BY i.id`,
    [invoiceId]
  );
  const exceedsBalance = await client.query(
    "SELECT $1::numeric > $2::numeric AS exceeds",
    [input.amount, balance.rows[0].balance]
  );
  if (exceedsBalance.rows[0].exceeds) {
    return { overpayment: true };
  }
  const inserted = await client.query(
    `INSERT INTO payments (invoice_id, amount, currency, method, reference, status)
     VALUES ($1, $2::numeric, $3, $4, $5, 'pending')
     RETURNING id`,
    [invoiceId, input.amount, currency, input.method, input.reference]
  );
  await notifyOrganizationMembers(client, row.providerOrganizationId, userId, {
    type: "payment_recorded",
    title: "Payment recorded",
    message: "A consumer recorded a payment for an invoice.",
    relatedEntityType: "payment",
    relatedEntityId: inserted.rows[0].id,
  });
  return { id: inserted.rows[0].id };
}

async function getPaymentById(paymentId) {
  const result = await pool.query(
    `SELECT p.id, p.invoice_id AS "invoiceId", p.amount, p.currency,
            p.method, p.reference, p.status, p.paid_at AS "paidAt",
            p.created_at AS "createdAt", p.updated_at AS "updatedAt",
            i.invoice_number AS "invoiceNumber",
            i.consumer_organization_id AS "consumerOrganizationId",
            i.provider_organization_id AS "providerOrganizationId"
     FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.id = $1`,
    [paymentId]
  );
  return result.rows[0] || null;
}

async function canAccessPayment(userId, paymentId) {
  const result = await pool.query(
    `SELECT p.id FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.id = $2 AND (
       EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.id IN (i.consumer_organization_id, i.provider_organization_id)
       )
       OR EXISTS (
         SELECT 1 FROM users u WHERE u.id = $1
           AND u.status = 'active' AND u.platform_role = 'admin'
       )
     )`,
    [userId, paymentId]
  );
  return result.rowCount === 1;
}

async function transitionPayment(client, userId, paymentId, action) {
  const row = await client.query(
    "SELECT invoice_id FROM payments WHERE id = $1",
    [paymentId]
  );
  if (!row.rows[0]) {
    return { missing: true };
  }
  const invoiceLock = await client.query(
    `SELECT i.id, i.status, i.total_amount AS "totalAmount", i.due_at AS "dueAt",
            i.consumer_organization_id AS "consumerOrganizationId"
     FROM invoices i
     JOIN organizations po ON po.id = i.provider_organization_id
       AND po.organization_type = 'provider' AND po.status = 'active'
     JOIN provider_profiles pp ON pp.organization_id = po.id AND pp.status = 'approved'
     JOIN organization_memberships om ON om.organization_id = po.id
       AND om.user_id = $2 AND om.status = 'active' AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE i.id = $1
     FOR UPDATE OF i`,
    [row.rows[0].invoice_id, userId, writeRoles]
  );
  if (!invoiceLock.rows[0]) {
    return { missing: true };
  }
  const payment = await client.query(
    `SELECT id, amount, status FROM payments WHERE id = $1 AND invoice_id = $2 FOR UPDATE`,
    [paymentId, row.rows[0].invoice_id]
  );
  if (!payment.rows[0]) {
    return { missing: true };
  }
  const transitions = {
    confirm: { from: "pending", to: "completed" },
    fail: { from: "pending", to: "failed" },
    refund: { from: "completed", to: "refunded" },
  };
  const transition = transitions[action];
  if (payment.rows[0].status !== transition.from) {
    return { conflict: true, status: payment.rows[0].status };
  }
  if (action === "confirm") {
    const balance = await client.query(
      `SELECT i.total_amount - COALESCE(
         SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0
       ) AS balance
       FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
       WHERE i.id = $1 GROUP BY i.id`,
      [row.rows[0].invoice_id]
    );
    const exceedsBalance = await client.query(
      "SELECT $1::numeric > $2::numeric AS exceeds",
      [payment.rows[0].amount, balance.rows[0].balance]
    );
    if (exceedsBalance.rows[0].exceeds) {
      return { overpayment: true };
    }
    if (!["issued", "partially_paid", "overdue"].includes(invoiceLock.rows[0].status)) {
      return { invoiceConflict: true, status: invoiceLock.rows[0].status };
    }
  }
  const nextStatus = transition.to;
  await client.query(
    `UPDATE payments SET status = $2,
       paid_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END,
       updated_at = NOW()
     WHERE id = $1`,
    [paymentId, nextStatus]
  );
  await notifyOrganizationMembers(
    client,
    invoiceLock.rows[0].consumerOrganizationId,
    userId,
    {
      type: `payment_${nextStatus}`,
      title: `Payment ${nextStatus}`,
      message: `A provider marked your payment ${nextStatus}.`,
      relatedEntityType: "payment",
      relatedEntityId: paymentId,
    }
  );
  const invoice = await client.query(
    `UPDATE invoices i
     SET status = CASE
           WHEN COALESCE((SELECT SUM(p.amount) FROM payments p
             WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) >= i.total_amount
             THEN 'paid'
           WHEN COALESCE((SELECT SUM(p.amount) FROM payments p
             WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) > 0
             THEN 'partially_paid'
           WHEN i.due_at < NOW() THEN 'overdue'
           ELSE 'issued'
         END,
         paid_at = CASE
           WHEN COALESCE((SELECT SUM(p.amount) FROM payments p
             WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) >= i.total_amount
             THEN NOW()
           ELSE NULL
         END,
         updated_at = NOW()
     WHERE i.id = $1
     RETURNING status`,
    [row.rows[0].invoice_id]
  );
  return {
    id: paymentId,
    status: nextStatus,
    invoiceId: row.rows[0].invoice_id,
    invoiceStatus: invoice.rows[0].status,
  };
}

async function listPayments(userId, invoiceId, filters, admin) {
  const values = [invoiceId];
  const conditions = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`p.status = $${values.length}`);
  }
  const extra = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
  const authorization = admin
    ? `EXISTS (SELECT 1 FROM users u WHERE u.id = $${values.length + 1}
         AND u.status = 'active' AND u.platform_role = 'admin')`
    : `EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $${values.length + 1} AND om.status = 'active'
           AND o.id IN (i.consumer_organization_id, i.provider_organization_id)
       )`;
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.id = $1${extra} AND ${authorization}`,
    [...values, userId]
  );
  const paged = [...values, userId, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT p.id, p.invoice_id AS "invoiceId", p.amount, p.currency,
            p.method, p.reference, p.status, p.paid_at AS "paidAt",
            p.created_at AS "createdAt", p.updated_at AS "updatedAt"
     FROM payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE i.id = $1${extra} AND ${authorization}
     ORDER BY p.created_at DESC, p.id
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

module.exports = {
  canAccessPayment,
  createInvoice,
  createPayment,
  findActiveMemberships,
  findMembership,
  getAccessibleInvoice,
  getInvoiceById,
  getPaymentById,
  isActiveAdmin,
  listInvoices,
  listPayments,
  recalculateInvoice,
  transitionInvoice,
  transitionPayment,
  updateDraftInvoice,
};
