const { validateUuid } = require("./phase4");

const priorities = new Set(["low", "normal", "high", "urgent"]);
const requestFields = new Set([
  "assetId",
  "providerOrganizationId",
  "serviceCategoryId",
  "serviceType",
  "description",
  "priority",
  "preferredAt",
]);
const quoteFields = new Set([
  "currency",
  "taxAmount",
  "estimatedDays",
  "validUntil",
  "notes",
  "items",
]);
const decimalPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (!datePattern.test(value)) {
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

function validateRequestQuery(query) {
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
    const allowed = [
      "draft",
      "submitted",
      "assigned",
      "quoted",
      "accepted",
      "in_progress",
      "completed",
      "cancelled",
      "rejected",
    ];
    if (!allowed.includes(query.status)) {
      return { error: "status is not valid." };
    }
    value.status = query.status;
  }
  if (query.priority !== undefined) {
    if (!priorities.has(query.priority)) {
      return { error: "priority must be low, normal, high, or urgent." };
    }
    value.priority = query.priority;
  }
  return { value };
}

function validateServiceRequest(body, partial = false) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((field) => !requestFields.has(field))) {
    return { error: "Request contains unsupported service request fields." };
  }
  if (partial && Object.hasOwn(body, "providerOrganizationId")) {
    return { error: "providerOrganizationId can only be set when creating a service request." };
  }
  if (!partial && !Object.hasOwn(body, "description")) {
    return { error: "description is required." };
  }

  const value = {};
  if (Object.hasOwn(body, "assetId")) {
    if (body.assetId !== null) {
      const error = validateUuid(body.assetId, "assetId");
      if (error) {
        return { error };
      }
    }
    value.assetId = body.assetId;
  }
  if (Object.hasOwn(body, "providerOrganizationId")) {
    if (body.providerOrganizationId !== null) {
      const error = validateUuid(body.providerOrganizationId, "providerOrganizationId");
      if (error) {
        return { error };
      }
    }
    value.providerOrganizationId = body.providerOrganizationId;
  }
  if (Object.hasOwn(body, "serviceCategoryId")) {
    if (body.serviceCategoryId !== null) {
      const error = validateUuid(body.serviceCategoryId, "serviceCategoryId");
      if (error) {
        return { error };
      }
    }
    value.serviceCategoryId = body.serviceCategoryId;
  }
  if (Object.hasOwn(body, "serviceType")) {
    if (
      body.serviceType !== null &&
      (typeof body.serviceType !== "string" || body.serviceType.trim().length > 150)
    ) {
      return { error: "serviceType must be at most 150 characters or null." };
    }
    value.serviceType =
      typeof body.serviceType === "string" ? body.serviceType.trim() || null : null;
  }
  if (Object.hasOwn(body, "description")) {
    if (
      typeof body.description !== "string" ||
      !body.description.trim() ||
      body.description.trim().length > 10000
    ) {
      return { error: "description is required and must be at most 10000 characters." };
    }
    value.description = body.description.trim();
  }
  if (Object.hasOwn(body, "priority")) {
    if (!priorities.has(body.priority)) {
      return { error: "priority must be low, normal, high, or urgent." };
    }
    value.priority = body.priority;
  } else if (!partial) {
    value.priority = "normal";
  }
  if (Object.hasOwn(body, "preferredAt")) {
    if (body.preferredAt !== null && !validTimestamp(body.preferredAt)) {
      return { error: "preferredAt must be a valid ISO 8601 timestamp with a timezone, or null." };
    }
    value.preferredAt = body.preferredAt;
  }
  if (!partial && !body.serviceCategoryId && !body.serviceType) {
    return { error: "serviceCategoryId or serviceType is required so providers can match the request." };
  }
  return { value };
}

function validateQuote(body, partial = false) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((field) => !quoteFields.has(field))) {
    return { error: "Request contains unsupported quote fields." };
  }
  if (!partial && (!Array.isArray(body.items) || body.items.length === 0)) {
    return { error: "At least one quote item is required." };
  }

  const value = {};
  let itemsTotalCents = 0n;
  if (Object.hasOwn(body, "currency")) {
    if (typeof body.currency !== "string" || !/^[a-z]{3}$/i.test(body.currency)) {
      return { error: "currency must be a three-letter ISO currency code." };
    }
    value.currency = body.currency.toUpperCase();
  } else if (!partial) {
    value.currency = "USD";
  }
  if (Object.hasOwn(body, "taxAmount")) {
    if (
      typeof body.taxAmount !== "string" &&
      typeof body.taxAmount !== "number"
    ) {
      return { error: "taxAmount must be a non-negative decimal with at most two places." };
    }
    const taxAmount = String(body.taxAmount);
    if (!decimalPattern.test(taxAmount)) {
      return { error: "taxAmount must be a non-negative decimal with at most two places." };
    }
    value.taxAmount = taxAmount;
  } else if (!partial) {
    value.taxAmount = "0";
  }
  if (Object.hasOwn(body, "estimatedDays")) {
    if (
      body.estimatedDays !== null &&
      (!Number.isInteger(body.estimatedDays) || body.estimatedDays < 1 || body.estimatedDays > 3650)
    ) {
      return { error: "estimatedDays must be an integer between 1 and 3650, or null." };
    }
    value.estimatedDays = body.estimatedDays;
  } else if (!partial) {
    value.estimatedDays = null;
  }
  if (Object.hasOwn(body, "validUntil")) {
    if (body.validUntil !== null && (typeof body.validUntil !== "string" || !validDate(body.validUntil))) {
      return { error: "validUntil must be a valid YYYY-MM-DD date or null." };
    }
    value.validUntil = body.validUntil;
  } else if (!partial) {
    value.validUntil = null;
  }
  if (Object.hasOwn(body, "notes")) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 10000)) {
      return { error: "notes must be at most 10000 characters or null." };
    }
    value.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  } else if (!partial) {
    value.notes = null;
  }
  if (Object.hasOwn(body, "items")) {
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return { error: "items must contain between 1 and 50 entries." };
    }
    value.items = [];
    for (const item of body.items) {
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
      if (!decimalPattern.test(quantity) || Number(quantity) <= 0) {
        return { error: "Each item quantity must be a positive decimal with at most two places." };
      }
      if (!decimalPattern.test(unitPrice)) {
        return { error: "Each item unitPrice must be a non-negative decimal with at most two places." };
      }
      const toCents = (amount) => {
        const [whole, fraction = ""] = amount.split(".");
        return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
      };
      const quantityCents = toCents(quantity);
      const unitPriceCents = toCents(unitPrice);
      const lineTotalCents = (quantityCents * unitPriceCents + 50n) / 100n;
      itemsTotalCents += lineTotalCents;
      if (lineTotalCents > 999999999999n || itemsTotalCents > 999999999999n) {
        return { error: "Quote item totals exceed the supported amount." };
      }
      value.items.push({
        description: item.description.trim(),
        quantity,
        unitPrice,
      });
    }
  }
  if (Object.hasOwn(body, "taxAmount") || !partial) {
    const taxAmount = value.taxAmount || "0";
    const [whole, fraction = ""] = taxAmount.split(".");
    const taxCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (itemsTotalCents + taxCents > 999999999999n) {
      return { error: "Quote total exceeds the supported amount." };
    }
  }
  return { value };
}

function validateMessage(body) {
  if (!isObject(body) || typeof body.message !== "string") {
    return { error: "message is required." };
  }
  const message = body.message.trim();
  if (!message || message.length > 5000) {
    return { error: "message must contain between 1 and 5000 characters." };
  }
  if (Object.keys(body).some((field) => field !== "message")) {
    return { error: "Request contains unsupported message fields." };
  }
  return { value: { message } };
}

function validateId(value, fieldName = "id") {
  return validateUuid(value, fieldName);
}

module.exports = {
  validateId,
  validateMessage,
  validatePagination,
  validateQuote,
  validateRequestQuery,
  validateServiceRequest,
};
