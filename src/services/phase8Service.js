const crypto = require("crypto");
const { pool } = require("../config/database");
const httpError = require("../utils/httpError");
const repository = require("../repositories/phase8Repository");

const writeRoles = new Set(["owner", "admin", "manager"]);

async function withTransaction(work) {
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN");
    open = true;
    const result = await work(client);
    await client.query("COMMIT");
    open = false;
    return result;
  } catch (error) {
    if (open) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Failed to roll back an invoice or payment transaction.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function paginated(result, page, limit) {
  return {
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  };
}

async function selectMembership(userId, organizationId) {
  const memberships = await repository.findActiveMemberships(userId);
  if (!memberships.length) {
    throw httpError(404, "No active organization membership was found.");
  }
  if (!organizationId && memberships.length > 1) {
    throw httpError(409, "organizationId is required when you have multiple active organization memberships.");
  }
  const membership = memberships.find((item) => item.id === organizationId) ||
    (organizationId ? null : memberships[0]);
  if (!membership) {
    throw httpError(404, "Active organization membership was not found.");
  }
  return membership;
}

async function listInvoices(userId, filters) {
  const admin = await repository.isActiveAdmin(userId);
  let organizationId = filters.organizationId;
  if (!admin) {
    const membership = await selectMembership(userId, organizationId);
    organizationId = membership.id;
  }
  const result = await repository.listInvoices(userId, organizationId, filters, admin);
  return paginated(result, filters.page, filters.limit);
}

async function getInvoice(userId, invoiceId) {
  if (!(await repository.getAccessibleInvoice(userId, invoiceId))) {
    throw httpError(404, "Invoice was not found.");
  }
  const invoice = await repository.getInvoiceById(invoiceId);
  if (!invoice) {
    throw httpError(404, "Invoice was not found.");
  }
  return { data: invoice };
}

async function createInvoice(userId, input) {
  const invoiceNumber =
    `INV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const result = await withTransaction(async (client) => {
    const created = await repository.createInvoice(
      client,
      userId,
      input.workOrderId,
      invoiceNumber,
      input
    );
    if (created.amountOverflow) {
      throw httpError(400, "Invoice totals exceed the supported monetary limit.");
    }
    return created;
  });
  if (result.unavailable) {
    throw httpError(409, "A completed work order and its active contract from an approved provider are required.");
  }
  if (result.duplicate) {
    throw httpError(409, "A non-cancelled invoice already exists for this work order.");
  }
  return { data: await repository.getInvoiceById(result.id) };
}

async function updateInvoice(userId, invoiceId, input) {
  if (!(await repository.getAccessibleInvoice(userId, invoiceId))) {
    throw httpError(404, "Invoice was not found.");
  }
  const current = await repository.getInvoiceById(invoiceId);
  const membership = current
    ? await repository.findMembership(userId, current.providerOrganizationId)
    : null;
  if (!membership) {
    throw httpError(403, "Only an active member of the provider organization can edit this invoice.");
  }
  if (!writeRoles.has(membership.role)) {
    throw httpError(403, "An organization owner, admin, or manager is required.");
  }
  const result = await withTransaction(async (client) => {
    const updated = await repository.updateDraftInvoice(client, userId, invoiceId, input);
    if (updated && updated.amountOverflow) {
      throw httpError(400, "Invoice totals exceed the supported monetary limit.");
    }
    return updated;
  });
  if (!result) {
    throw httpError(409, "Only a draft invoice for an active, approved provider can be edited.");
  }
  return { data: await repository.getInvoiceById(invoiceId) };
}

async function transitionInvoice(userId, invoiceId, action) {
  const result = await withTransaction((client) =>
    repository.transitionInvoice(client, userId, invoiceId, action)
  );
  if (result.missing) {
    throw httpError(404, "Invoice was not found or is not available to this provider organization.");
  }
  if (result.invalidDueDate) {
    throw httpError(409, "A due date in the future is required before issuing an invoice.");
  }
  if (result.emptyInvoice) {
    throw httpError(409, "An invoice with a positive total is required before issuing.");
  }
  if (result.conflict) {
    throw httpError(409, result.status === "has_payments"
      ? "An invoice with payment records cannot be cancelled."
      : `An invoice with status '${result.status}' cannot be ${action === "issue" ? "issued" : "cancelled"}.`);
  }
  return { data: await repository.getInvoiceById(invoiceId) };
}

async function listPayments(userId, invoiceId, filters) {
  if (!(await repository.getAccessibleInvoice(userId, invoiceId))) {
    throw httpError(404, "Invoice was not found.");
  }
  const admin = await repository.isActiveAdmin(userId);
  return paginated(
    await repository.listPayments(userId, invoiceId, filters, admin),
    filters.page,
    filters.limit
  );
}

async function getPayment(userId, paymentId) {
  if (!(await repository.canAccessPayment(userId, paymentId))) {
    throw httpError(404, "Payment was not found.");
  }
  const payment = await repository.getPaymentById(paymentId);
  if (!payment) {
    throw httpError(404, "Payment was not found.");
  }
  return { data: payment };
}

async function createPayment(userId, invoiceId, input) {
  const result = await withTransaction((client) =>
    repository.createPayment(client, userId, invoiceId, input)
  );
  if (result.missing) {
    throw httpError(404, "Invoice was not found or is not available to this consumer organization.");
  }
  if (result.conflict) {
    throw httpError(409, `A payment cannot be recorded for an invoice with status '${result.status}'.`);
  }
  if (result.currencyMismatch) {
    throw httpError(400, `Payment currency must match the invoice currency (${result.currency}).`);
  }
  if (result.overpayment) {
    throw httpError(409, "Payment amount exceeds the outstanding invoice balance.");
  }
  return { data: await repository.getPaymentById(result.id) };
}

async function transitionPayment(userId, paymentId, action) {
  const result = await withTransaction((client) =>
    repository.transitionPayment(client, userId, paymentId, action)
  );
  if (result.missing) {
    throw httpError(404, "Payment was not found or is not available to this provider organization.");
  }
  if (result.conflict) {
    throw httpError(409, `A payment with status '${result.status}' cannot be ${action}ed.`);
  }
  if (result.invoiceConflict) {
    throw httpError(409, `A payment cannot be confirmed for an invoice with status '${result.status}'.`);
  }
  if (result.overpayment) {
    throw httpError(409, "Payment confirmation would exceed the outstanding invoice balance.");
  }
  return { data: await repository.getPaymentById(paymentId) };
}

module.exports = {
  createInvoice,
  createPayment,
  getInvoice,
  getPayment,
  listInvoices,
  listPayments,
  transitionInvoice,
  transitionPayment,
  updateInvoice,
};
