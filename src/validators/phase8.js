const { validateUuid } = require("./phase4");
const { validatePagination } = require("./phase6");

const invoiceStatuses = new Set([
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
]);
const decimalPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const positiveDecimalPattern = /^(?:0*[1-9]\d{0,9}|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const maximumCents = 999999999999n;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== "string" || !timestampPattern.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && !Number.isNaN(Date.parse(value));
}

function toCents(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function validateId(value, name = "id") {
  return validateUuid(value, name);
}

function validateInvoiceQuery(query) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }
  const value = { ...pagination.value };
  if (query.organizationId !== undefined) {
    const error = validateUuid(query.organizationId, "organizationId");
    if (error) {
      return { error };
    }
    value.organizationId = query.organizationId;
  }
  if (query.status !== undefined) {
    if (!invoiceStatuses.has(query.status)) {
      return { error: "status is not a valid invoice status." };
    }
    value.status = query.status;
  }
  return { value };
}

function validatePaymentQuery(query) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }
  const value = { ...pagination.value };
  if (query.status !== undefined) {
    if (!["pending", "completed", "failed", "refunded"].includes(query.status)) {
      return { error: "status is not a valid payment status." };
    }
    value.status = query.status;
  }
  return { value };
}

function validateInvoiceCreate(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["workOrderId", "taxRate", "dueAt", "notes", "items"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported invoice fields." };
  }
  const workOrderError = validateUuid(body.workOrderId, "workOrderId");
  if (workOrderError) {
    return { error: workOrderError };
  }
  const value = { workOrderId: body.workOrderId, taxRate: "0", dueAt: null, notes: null };
  if (Object.hasOwn(body, "taxRate")) {
    const rate = String(body.taxRate);
    if (!decimalPattern.test(rate) || toCents(rate) > 99999n) {
      return { error: "taxRate must be a non-negative percentage with at most two decimal places and a maximum of 999.99." };
    }
    value.taxRate = rate;
  }
  if (Object.hasOwn(body, "dueAt")) {
    if (body.dueAt !== null && !validTimestamp(body.dueAt)) {
      return { error: "dueAt must be a timezone-qualified ISO 8601 timestamp or null." };
    }
    value.dueAt = body.dueAt;
  }
  if (Object.hasOwn(body, "notes")) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 10000)) {
      return { error: "notes must be at most 10000 characters or null." };
    }
    value.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  const items = validateItems(body.items);
  if (items.error) {
    return items;
  }
  value.items = items.value;
  return { value };
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return { error: "items must contain between 1 and 50 entries." };
  }
  const value = [];
  let subtotalCents = 0n;
  for (const item of items) {
    if (
      !isObject(item) ||
      Object.keys(item).some((field) => !["description", "quantity", "unitPrice"].includes(field))
    ) {
      return { error: "Each item must contain only description, quantity, and unitPrice." };
    }
    if (
      typeof item.description !== "string" ||
      !item.description.trim() ||
      item.description.trim().length > 255
    ) {
      return { error: "Each item description is required and must be at most 255 characters." };
    }
    const quantity = String(item.quantity ?? "");
    const unitPrice = String(item.unitPrice ?? "");
    if (!positiveDecimalPattern.test(quantity) || toCents(quantity) === 0n) {
      return { error: "Each item quantity must be greater than zero with at most two decimal places." };
    }
    if (!decimalPattern.test(unitPrice)) {
      return { error: "Each item unitPrice must be a non-negative decimal with at most two places." };
    }
    const quantityCents = toCents(quantity);
    const unitPriceCents = toCents(unitPrice);
    const lineCents = (quantityCents * unitPriceCents + 50n) / 100n;
    subtotalCents += lineCents;
    if (lineCents > maximumCents || subtotalCents > maximumCents) {
      return { error: "Invoice item amounts exceed the supported total." };
    }
    value.push({
      description: item.description.trim(),
      quantity,
      unitPrice,
    });
  }
  return { value, subtotalCents };
}

function validateInvoicePatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["taxRate", "dueAt", "notes", "items"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Only taxRate, dueAt, notes, and items can be edited on a draft invoice." };
  }
  const value = {};
  if (Object.hasOwn(body, "taxRate")) {
    const rate = String(body.taxRate);
    if (!decimalPattern.test(rate) || toCents(rate) > 99999n) {
      return { error: "taxRate must be a non-negative percentage with at most two decimal places and a maximum of 999.99." };
    }
    value.taxRate = rate;
  }
  if (Object.hasOwn(body, "dueAt")) {
    if (body.dueAt !== null && !validTimestamp(body.dueAt)) {
      return { error: "dueAt must be a timezone-qualified ISO 8601 timestamp or null." };
    }
    value.dueAt = body.dueAt;
  }
  if (Object.hasOwn(body, "notes")) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 10000)) {
      return { error: "notes must be at most 10000 characters or null." };
    }
    value.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (Object.hasOwn(body, "items")) {
    const items = validateItems(body.items);
    if (items.error) {
      return items;
    }
    value.items = items.value;
  }
  return { value };
}

function validatePaymentCreate(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["amount", "currency", "method", "reference"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Payment status, paid date, and invoice totals are assigned by the server." };
  }
  const amount = String(body.amount ?? "");
  if (!positiveDecimalPattern.test(amount) || toCents(amount) === 0n) {
    return { error: "amount must be greater than zero with at most two decimal places." };
  }
  const value = { amount };
  if (Object.hasOwn(body, "currency")) {
    if (typeof body.currency !== "string" || !/^[a-z]{3}$/i.test(body.currency)) {
      return { error: "currency must be a three-letter currency code." };
    }
    value.currency = body.currency.toUpperCase();
  }
  if (Object.hasOwn(body, "method")) {
    if (body.method !== null &&
      (typeof body.method !== "string" || !body.method.trim() || body.method.trim().length > 30)) {
      return { error: "method must be a non-empty label of at most 30 characters or null." };
    }
    value.method = typeof body.method === "string" ? body.method.trim() : null;
  }
  if (Object.hasOwn(body, "reference")) {
    if (body.reference !== null &&
      (typeof body.reference !== "string" || body.reference.trim().length > 150)) {
      return { error: "reference must be at most 150 characters or null." };
    }
    value.reference = typeof body.reference === "string" ? body.reference.trim() || null : null;
  }
  return { value };
}

function validatePaymentAction(body) {
  if (body === undefined) {
    return { value: {} };
  }
  if (!isObject(body) || Object.keys(body).length > 0) {
    return { error: "This payment action does not accept a request body." };
  }
  return { value: {} };
}

module.exports = {
  validateId,
  validateInvoiceCreate,
  validateInvoicePatch,
  validateInvoiceQuery,
  validatePaymentAction,
  validatePaymentCreate,
  validatePaymentQuery,
};
