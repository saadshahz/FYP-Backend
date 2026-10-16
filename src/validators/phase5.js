const { validateUuid } = require("./phase4");

const assetStatuses = new Set(["active", "inactive", "under_maintenance", "retired"]);
const maintenanceFrequencies = new Set([
  "weekly",
  "monthly",
  "quarterly",
  "semiannually",
  "annually",
]);
const assetFields = new Set([
  "name",
  "category",
  "manufacturer",
  "model",
  "serialNumber",
  "location",
  "installDate",
  "warrantyExpiry",
]);
const maintenancePlanFields = new Set([
  "providerOrganizationId",
  "frequency",
  "nextDueAt",
  "isActive",
]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validCalendarDate(value) {
  if (!isoDatePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateAssetQuery(query) {
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
    if (!assetStatuses.has(query.status)) {
      return { error: "status must be active, inactive, under_maintenance, or retired." };
    }
    value.status = query.status;
  }
  if (query.category !== undefined) {
    if (typeof query.category !== "string" || query.category.trim().length > 150) {
      return { error: "category must be at most 150 characters." };
    }
    value.category = query.category.trim();
  }
  return { value };
}

function validatePagination(query) {
  const rawPage = query.page === undefined ? "1" : query.page;
  const rawLimit = query.limit === undefined ? "20" : query.limit;
  if (
    typeof rawPage !== "string" ||
    !/^[1-9]\d*$/.test(rawPage) ||
    typeof rawLimit !== "string" ||
    !/^[1-9]\d*$/.test(rawLimit)
  ) {
    return { error: "page and limit must be positive integers." };
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    return { error: "page must be a safe integer and limit must be between 1 and 100." };
  }
  return { value: { page, limit } };
}

function validateOrganizationSelection(query) {
  if (query.organizationId === undefined) {
    return { value: undefined };
  }
  const error = validateUuid(query.organizationId, "organizationId");
  return error ? { error } : { value: query.organizationId };
}

function validateAssetInput(body, partial = false) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((field) => !assetFields.has(field))) {
    return { error: "Request contains unsupported asset fields." };
  }
  if (!partial && !Object.hasOwn(body, "name")) {
    return { error: "name is required." };
  }

  const value = {};
  const fields = {
    name: 200,
    category: 150,
    manufacturer: 150,
    model: 150,
    serialNumber: 150,
    location: 5000,
  };
  for (const [field, maximum] of Object.entries(fields)) {
    if (!Object.hasOwn(body, field)) {
      continue;
    }
    const fieldValue = body[field];
    if (fieldValue !== null && (typeof fieldValue !== "string" || fieldValue.trim().length > maximum)) {
      return { error: `${field} must be a string of at most ${maximum} characters or null.` };
    }
    const normalized = typeof fieldValue === "string" ? fieldValue.trim() || null : null;
    if (field === "name" && !normalized) {
      return { error: "name is required and cannot be empty." };
    }
    value[field] = normalized;
  }

  for (const field of ["installDate", "warrantyExpiry"]) {
    if (!Object.hasOwn(body, field)) {
      continue;
    }
    const date = body[field];
    if (date !== null && (typeof date !== "string" || !validCalendarDate(date))) {
      return { error: `${field} must be a valid YYYY-MM-DD date or null.` };
    }
    value[field] = date;
  }
  const installDate = Object.hasOwn(value, "installDate") ? value.installDate : body.installDate;
  const warrantyExpiry = Object.hasOwn(value, "warrantyExpiry")
    ? value.warrantyExpiry
    : body.warrantyExpiry;
  if (installDate && warrantyExpiry && warrantyExpiry < installDate) {
    return { error: "warrantyExpiry cannot be earlier than installDate." };
  }
  return { value };
}

function validateMaintenancePlanInput(body, partial = false) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((field) => !maintenancePlanFields.has(field))) {
    return { error: "Request contains unsupported maintenance plan fields." };
  }
  if (!partial && (!Object.hasOwn(body, "frequency") || !Object.hasOwn(body, "providerOrganizationId"))) {
    return { error: "providerOrganizationId and frequency are required." };
  }

  const value = {};
  if (Object.hasOwn(body, "providerOrganizationId")) {
    const error = validateUuid(body.providerOrganizationId, "providerOrganizationId");
    if (error) {
      return { error };
    }
    value.providerOrganizationId = body.providerOrganizationId;
  }
  if (Object.hasOwn(body, "frequency")) {
    if (typeof body.frequency !== "string" || !maintenanceFrequencies.has(body.frequency)) {
      return { error: "frequency must be weekly, monthly, quarterly, semiannually, or annually." };
    }
    value.frequency = body.frequency;
  }
  if (Object.hasOwn(body, "nextDueAt")) {
    const date = body.nextDueAt;
    if (
      date !== null &&
      (typeof date !== "string" ||
        !isoDateTimePattern.test(date) ||
        !validCalendarDate(date.slice(0, 10)) ||
        Number.isNaN(Date.parse(date)))
    ) {
      return { error: "nextDueAt must be a valid ISO 8601 timestamp with a timezone, or null." };
    }
    value.nextDueAt = date;
  } else if (!partial) {
    value.nextDueAt = null;
  }
  if (Object.hasOwn(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      return { error: "isActive must be a boolean." };
    }
    value.isActive = body.isActive;
  } else if (!partial) {
    value.isActive = true;
  }
  return { value };
}

function validateUuidParam(value, fieldName) {
  return validateUuid(value, fieldName);
}

module.exports = {
  assetStatuses: [...assetStatuses],
  maintenanceFrequencies: [...maintenanceFrequencies],
  validateAssetInput,
  validateAssetQuery,
  validateMaintenancePlanInput,
  validateOrganizationSelection,
  validatePagination,
  validateUuidParam,
};
