const { validateUuid } = require("./phase4");
const { validatePagination } = require("./phase6");

const contractStatuses = new Set([
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "active",
  "completed",
  "cancelled",
]);
const workOrderStatuses = new Set([
  "pending",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const decimalPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    timestampPattern.test(value) &&
    validDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateUuidParam(value, field = "id") {
  return validateUuid(value, field);
}

function validateOrganizationQuery(query, resource) {
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
    const statuses = resource === "contracts"
      ? contractStatuses
      : resource === "workOrders"
        ? workOrderStatuses
        : new Set([...contractStatuses, ...workOrderStatuses]);
    if (!statuses.has(query.status)) {
      return { error: "status is not valid." };
    }
    value.status = query.status;
  }
  return { value };
}

function validateContractCreate(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["quoteId", "terms", "startDate", "endDate"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported contract fields." };
  }
  const quoteError = validateUuid(body.quoteId, "quoteId");
  if (quoteError) {
    return { error: quoteError };
  }
  const value = { quoteId: body.quoteId };
  if (Object.hasOwn(body, "terms")) {
    if (body.terms !== null && (typeof body.terms !== "string" || body.terms.length > 20000)) {
      return { error: "terms must be at most 20000 characters or null." };
    }
    value.terms = typeof body.terms === "string" ? body.terms.trim() || null : null;
  }
  for (const field of ["startDate", "endDate"]) {
    if (Object.hasOwn(body, field)) {
      if (body[field] !== null && !validDate(body[field])) {
        return { error: `${field} must be a valid YYYY-MM-DD date or null.` };
      }
      value[field] = body[field];
    }
  }
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    return { error: "endDate cannot be earlier than startDate." };
  }
  return { value };
}

function validateContractPatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["terms", "startDate", "endDate"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Only terms, startDate, and endDate can be edited on a draft contract." };
  }
  const value = {};
  if (Object.hasOwn(body, "terms")) {
    if (body.terms !== null && (typeof body.terms !== "string" || body.terms.length > 20000)) {
      return { error: "terms must be at most 20000 characters or null." };
    }
    value.terms = typeof body.terms === "string" ? body.terms.trim() || null : null;
  }
  for (const field of ["startDate", "endDate"]) {
    if (Object.hasOwn(body, field)) {
      if (body[field] !== null && !validDate(body[field])) {
        return { error: `${field} must be a valid YYYY-MM-DD date or null.` };
      }
      value[field] = body[field];
    }
  }
  return { value };
}

function validateWorkOrderCreate(body) {
  if (body === undefined) {
    body = {};
  }
  if (!isObject(body)) {
    return { error: "A JSON object is required." };
  }
  const allowed = new Set(["priority", "scheduledStartAt", "scheduledEndAt", "estimatedCost", "notes"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported work order fields." };
  }
  const value = {};
  if (Object.hasOwn(body, "priority")) {
    if (!priorities.has(body.priority)) {
      return { error: "priority must be low, normal, high, or urgent." };
    }
    value.priority = body.priority;
  } else {
    value.priority = "normal";
  }
  for (const field of ["scheduledStartAt", "scheduledEndAt"]) {
    if (Object.hasOwn(body, field)) {
      if (body[field] !== null && !validTimestamp(body[field])) {
        return { error: `${field} must be a timezone-qualified ISO 8601 timestamp or null.` };
      }
      value[field] = body[field];
    }
  }
  if (
    value.scheduledStartAt &&
    value.scheduledEndAt &&
    Date.parse(value.scheduledEndAt) < Date.parse(value.scheduledStartAt)
  ) {
    return { error: "scheduledEndAt cannot be earlier than scheduledStartAt." };
  }
  if (Object.hasOwn(body, "estimatedCost")) {
    if (body.estimatedCost !== null && !decimalPattern.test(String(body.estimatedCost))) {
      return { error: "estimatedCost must be a non-negative decimal with at most two places or null." };
    }
    value.estimatedCost =
      body.estimatedCost === null ? null : String(body.estimatedCost);
  }
  if (Object.hasOwn(body, "notes")) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 10000)) {
      return { error: "notes must be at most 10000 characters or null." };
    }
    value.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  return { value };
}

function validateWorkOrderPatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const validation = validateWorkOrderCreate(body);
  if (validation.error) {
    return validation;
  }
  if (Object.hasOwn(body, "priority") || Object.hasOwn(body, "scheduledStartAt") ||
      Object.hasOwn(body, "scheduledEndAt") || Object.hasOwn(body, "estimatedCost") ||
      Object.hasOwn(body, "notes")) {
    return validation;
  }
  return { error: "At least one editable work order field is required." };
}

function validateAssignment(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  const allowed = new Set(["technicianId", "scheduledStartAt", "scheduledEndAt", "note"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported assignment fields." };
  }
  const error = validateUuid(body.technicianId, "technicianId");
  if (error) {
    return { error };
  }
  const value = { technicianId: body.technicianId };
  for (const field of ["scheduledStartAt", "scheduledEndAt"]) {
    if (Object.hasOwn(body, field)) {
      if (!validTimestamp(body[field])) {
        return { error: `${field} must be a timezone-qualified ISO 8601 timestamp.` };
      }
      value[field] = body[field];
    }
  }
  if (
    value.scheduledStartAt &&
    value.scheduledEndAt &&
    Date.parse(value.scheduledEndAt) < Date.parse(value.scheduledStartAt)
  ) {
    return { error: "scheduledEndAt cannot be earlier than scheduledStartAt." };
  }
  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 1000)) {
      return { error: "note must be at most 1000 characters or null." };
    }
    value.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  return { value };
}

function validateCompletion(body) {
  if (body === undefined) {
    body = {};
  }
  if (!isObject(body)) {
    return { error: "A JSON object is required." };
  }
  const allowed = new Set(["actualCost", "note"]);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported completion fields." };
  }
  const value = {};
  if (Object.hasOwn(body, "actualCost")) {
    if (body.actualCost !== null && !decimalPattern.test(String(body.actualCost))) {
      return { error: "actualCost must be a non-negative decimal with at most two places or null." };
    }
    value.actualCost = body.actualCost === null ? null : String(body.actualCost);
  }
  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 1000)) {
      return { error: "note must be at most 1000 characters or null." };
    }
    value.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  return { value };
}

module.exports = {
  validateAssignment,
  validateCompletion,
  validateContractCreate,
  validateContractPatch,
  validateOrganizationQuery,
  validateUuidParam,
  validateWorkOrderCreate,
  validateWorkOrderPatch,
};
