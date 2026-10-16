const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const organizationFields = new Set([
  "name",
  "industryId",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "postalCode",
]);
const profileFields = new Set([
  "description",
  "websiteUrl",
  "serviceArea",
  "emergencyAvailable",
  "responseTimeHours",
]);
const serviceFields = new Set([
  "serviceCategoryId",
  "name",
  "description",
  "basePrice",
  "currency",
]);

function hasAtMostTwoDecimalPlaces(value) {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = Number(exponentText || 0);
  const fractionalDigits = (coefficient.split(".")[1] || "").length;
  return Math.max(0, fractionalDigits - exponent) <= 2;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateUuid(value, fieldName) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return `${fieldName} must be a valid UUID.`;
  }
  return null;
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
  const value = query.organizationId;
  if (value === undefined) {
    return { value: undefined };
  }
  const error = validateUuid(value, "organizationId");
  return error ? { error } : { value };
}

function validateCatalogQuery(query, allowIndustryFilter = false) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }

  let industryId;
  if (allowIndustryFilter && query.industryId !== undefined) {
    const error = validateUuid(query.industryId, "industryId");
    if (error) {
      return { error };
    }
    industryId = query.industryId;
  }

  return { value: { ...pagination.value, industryId } };
}

function validateOrganizationPatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((key) => !organizationFields.has(key))) {
    return { error: "Request contains unsupported organization fields." };
  }

  const value = {};
  const stringFields = {
    name: 200,
    email: 255,
    phone: 30,
    address: 5000,
    city: 100,
    state: 100,
    country: 100,
    postalCode: 20,
  };
  for (const [field, maximum] of Object.entries(stringFields)) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "string" || body[field].trim().length > maximum) {
        return { error: `${field} must be a string of at most ${maximum} characters.` };
      }
      value[field] = body[field].trim() || null;
    }
  }
  if (Object.hasOwn(body, "name") && !value.name) {
    return { error: "name cannot be empty." };
  }
  if (Object.hasOwn(body, "email") && value.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
      return { error: "email must be a valid email address." };
    }
  }
  if (Object.hasOwn(body, "industryId")) {
    if (body.industryId !== null) {
      const error = validateUuid(body.industryId, "industryId");
      if (error) {
        return { error };
      }
    }
    value.industryId = body.industryId;
  }
  return { value };
}

function validateProviderProfilePatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((key) => !profileFields.has(key))) {
    return { error: "Request contains unsupported provider profile fields." };
  }

  const value = {};
  for (const [field, maximum] of [
    ["description", 5000],
    ["websiteUrl", 2048],
    ["serviceArea", 500],
  ]) {
    if (!Object.hasOwn(body, field)) {
      continue;
    }
    if (body[field] !== null && (typeof body[field] !== "string" || body[field].length > maximum)) {
      return { error: `${field} must be a string of at most ${maximum} characters or null.` };
    }
    value[field] = typeof body[field] === "string" ? body[field].trim() || null : null;
  }
  if (Object.hasOwn(body, "websiteUrl") && value.websiteUrl) {
    try {
      const url = new URL(value.websiteUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "websiteUrl must use HTTP or HTTPS." };
      }
    } catch {
      return { error: "websiteUrl must be a valid HTTP or HTTPS URL." };
    }
  }
  if (Object.hasOwn(body, "emergencyAvailable")) {
    if (typeof body.emergencyAvailable !== "boolean") {
      return { error: "emergencyAvailable must be a boolean." };
    }
    value.emergencyAvailable = body.emergencyAvailable;
  }
  if (Object.hasOwn(body, "responseTimeHours")) {
    const hours = body.responseTimeHours;
    if (hours !== null && (!Number.isInteger(hours) || hours < 0)) {
      return { error: "responseTimeHours must be a non-negative integer or null." };
    }
    value.responseTimeHours = hours;
  }
  return { value };
}

function validateServiceInput(body, partial = false) {
  if (!isObject(body) || Object.keys(body).length === 0) {
    return { error: "A non-empty JSON object is required." };
  }
  if (Object.keys(body).some((key) => !serviceFields.has(key))) {
    return { error: "Request contains unsupported service fields." };
  }
  if (!partial && (!Object.hasOwn(body, "name") || !body.name)) {
    return { error: "name is required." };
  }

  const value = {};
  if (Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
      return { error: "name is required and must be at most 200 characters." };
    }
    value.name = body.name.trim();
  }
  if (Object.hasOwn(body, "description")) {
    if (body.description !== null && (typeof body.description !== "string" || body.description.length > 5000)) {
      return { error: "description must be a string of at most 5000 characters or null." };
    }
    value.description = typeof body.description === "string" ? body.description.trim() || null : null;
  } else if (!partial) {
    value.description = null;
  }
  if (Object.hasOwn(body, "serviceCategoryId")) {
    if (body.serviceCategoryId !== null) {
      const error = validateUuid(body.serviceCategoryId, "serviceCategoryId");
      if (error) {
        return { error };
      }
    }
    value.serviceCategoryId = body.serviceCategoryId;
  } else if (!partial) {
    value.serviceCategoryId = null;
  }
  if (Object.hasOwn(body, "basePrice")) {
    if (
      body.basePrice !== null &&
      (typeof body.basePrice !== "number" ||
        !Number.isFinite(body.basePrice) ||
        body.basePrice < 0 ||
        body.basePrice > 9999999999.99 ||
        !hasAtMostTwoDecimalPlaces(body.basePrice))
    ) {
      return { error: "basePrice must be a non-negative amount with at most two decimal places, or null." };
    }
    value.basePrice = body.basePrice;
  } else if (!partial) {
    value.basePrice = null;
  }
  if (Object.hasOwn(body, "currency")) {
    if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) {
      return { error: "currency must be a three-letter ISO currency code." };
    }
    value.currency = body.currency.toUpperCase();
  } else if (!partial) {
    value.currency = "USD";
  }
  return { value };
}

function validateMarketplaceQuery(query) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }
  const value = { ...pagination.value };
  for (const field of ["industryId", "serviceCategoryId"]) {
    if (query[field] !== undefined) {
      const error = validateUuid(query[field], field);
      if (error) {
        return { error };
      }
      value[field] = query[field];
    }
  }
  for (const field of ["city", "search"]) {
    if (query[field] !== undefined) {
      if (typeof query[field] !== "string" || query[field].trim().length > 100) {
        return { error: `${field} must be at most 100 characters.` };
      }
      value[field] = query[field].trim();
    }
  }
  return { value };
}

module.exports = {
  validateCatalogQuery,
  validateMarketplaceQuery,
  validateOrganizationPatch,
  validateOrganizationSelection,
  validateProviderProfilePatch,
  validateServiceInput,
  validateUuid,
};
