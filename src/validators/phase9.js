const { validateUuid } = require("./phase4");
const { validatePagination } = require("./phase6");

const priorities = new Set(["low", "normal", "high", "urgent"]);
const ticketStatuses = new Set(["open", "in_progress", "resolved", "closed"]);
const mimePattern = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateId(value, field = "id") {
  return validateUuid(value, field);
}

function validatePageQuery(query, filters = {}) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }
  const value = { ...pagination.value };
  for (const [field, allowed] of Object.entries(filters)) {
    if (query[field] !== undefined) {
      const error = allowed(query[field], field);
      if (error) {
        return { error };
      }
      value[field] = query[field];
    }
  }
  return { value };
}

function validateNotificationQuery(query) {
  return validatePageQuery(query, {
    unreadOnly(value) {
      return ["true", "false"].includes(value) ? null : "unreadOnly must be true or false.";
    },
  });
}

function validateTicketQuery(query) {
  return validatePageQuery(query, {
    status(value) {
      return ticketStatuses.has(value) ? null : "status is not a valid ticket status.";
    },
    priority(value) {
      return priorities.has(value) ? null : "priority must be low, normal, high, or urgent.";
    },
  });
}

function validateTicketCreate(body) {
  if (!isObject(body) || Object.keys(body).some(
    (field) => !["subject", "description", "category", "priority"].includes(field)
  )) {
    return { error: "subject, description, category, and priority are the only supported ticket fields." };
  }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!subject || subject.length > 255) {
    return { error: "subject is required and must be at most 255 characters." };
  }
  if (!description || description.length > 10000) {
    return { error: "description is required and must be at most 10000 characters." };
  }
  const category = body.category === undefined || body.category === null
    ? null
    : typeof body.category === "string" ? body.category.trim() : undefined;
  if (category === undefined || (category && category.length > 100)) {
    return { error: "category must be at most 100 characters or null." };
  }
  const priority = body.priority === undefined ? "normal" : body.priority;
  if (!priorities.has(priority)) {
    return { error: "priority must be low, normal, high, or urgent." };
  }
  return { value: { subject, description, category: category || null, priority } };
}

function validateTicketPatch(body, staff) {
  const allowed = staff
    ? new Set(["subject", "description", "category", "priority", "assignedToUserId"])
    : new Set(["subject", "description", "category", "priority"]);
  if (!isObject(body) || Object.keys(body).length === 0 ||
      Object.keys(body).some((field) => !allowed.has(field))) {
    return { error: "Request contains unsupported support-ticket fields." };
  }
  const value = {};
  for (const [field, maxLength] of [["subject", 255], ["description", 10000], ["category", 100]]) {
    if (Object.hasOwn(body, field)) {
      if (body[field] !== null && typeof body[field] !== "string") {
        return { error: `${field} must be a string or null.` };
      }
      const text = typeof body[field] === "string" ? body[field].trim() : null;
      if ((field !== "category" && !text) || (text && text.length > maxLength)) {
        return { error: `${field} is required and must be at most ${maxLength} characters.` };
      }
      value[field] = text;
    }
  }
  if (Object.hasOwn(body, "priority")) {
    if (!priorities.has(body.priority)) {
      return { error: "priority must be low, normal, high, or urgent." };
    }
    value.priority = body.priority;
  }
  if (Object.hasOwn(body, "assignedToUserId")) {
    if (body.assignedToUserId !== null) {
      const error = validateUuid(body.assignedToUserId, "assignedToUserId");
      if (error) {
        return { error };
      }
    }
    value.assignedToUserId = body.assignedToUserId;
  }
  return { value };
}

function validateTicketMessage(body) {
  if (!isObject(body) || Object.keys(body).length !== 1 || typeof body.message !== "string") {
    return { error: "message is the only supported field." };
  }
  const message = body.message.trim();
  if (!message || message.length > 5000) {
    return { error: "message must contain between 1 and 5000 characters." };
  }
  return { value: { message } };
}

function validateReviewQuery(query) {
  return validatePageQuery(query, {
    providerOrganizationId(value) {
      return validateUuid(value, "providerOrganizationId");
    },
  });
}

function validateReviewCreate(body) {
  if (!isObject(body) || Object.keys(body).some(
    (field) => !["serviceRequestId", "rating", "comment"].includes(field)
  )) {
    return { error: "serviceRequestId, rating, and comment are the only supported review fields." };
  }
  const error = validateUuid(body.serviceRequestId, "serviceRequestId");
  if (error) {
    return { error };
  }
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    return { error: "rating must be an integer from 1 to 5." };
  }
  if (body.comment !== undefined && body.comment !== null &&
      (typeof body.comment !== "string" || body.comment.length > 5000)) {
    return { error: "comment must be at most 5000 characters or null." };
  }
  return { value: { serviceRequestId: body.serviceRequestId, rating: body.rating,
    comment: typeof body.comment === "string" ? body.comment.trim() || null : null } };
}

function validateReviewPatch(body) {
  if (!isObject(body) || Object.keys(body).length === 0 ||
      Object.keys(body).some((field) => !["rating", "comment"].includes(field))) {
    return { error: "Only rating and comment can be changed." };
  }
  const value = {};
  if (Object.hasOwn(body, "rating")) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return { error: "rating must be an integer from 1 to 5." };
    }
    value.rating = body.rating;
  }
  if (Object.hasOwn(body, "comment")) {
    if (body.comment !== null && (typeof body.comment !== "string" || body.comment.length > 5000)) {
      return { error: "comment must be at most 5000 characters or null." };
    }
    value.comment = typeof body.comment === "string" ? body.comment.trim() || null : null;
  }
  return { value };
}

function validateAttachmentQuery(query) {
  const pagination = validatePagination(query);
  if (pagination.error) {
    return pagination;
  }
  const value = { ...pagination.value };
  const parents = ["serviceRequestId", "ticketId"].filter((field) => query[field] !== undefined);
  if (parents.length !== 1) {
    return { error: "Exactly one of serviceRequestId or ticketId is required." };
  }
  const parentError = validateUuid(query[parents[0]], parents[0]);
  if (parentError) {
    return { error: parentError };
  }
  value[parents[0]] = query[parents[0]];
  return { value };
}

function validateAttachmentCreate(body) {
  const fields = new Set([
    "serviceRequestId", "ticketId", "storageKey", "fileName", "mimeType", "sizeBytes",
  ]);
  if (!isObject(body) || Object.keys(body).some((field) => !fields.has(field))) {
    return { error: "Request contains unsupported attachment metadata fields." };
  }
  const parentFields = ["serviceRequestId", "ticketId"].filter((field) => body[field] !== undefined);
  if (parentFields.length !== 1) {
    return { error: "Exactly one of serviceRequestId or ticketId is required." };
  }
  const parentError = validateUuid(body[parentFields[0]], parentFields[0]);
  if (parentError) {
    return { error: parentError };
  }
  if (typeof body.storageKey !== "string" || !body.storageKey.trim() ||
      body.storageKey.length > 2048 || /[\u0000-\u001f\u007f]/.test(body.storageKey) ||
      body.storageKey.split(/[\\/]/).includes("..")) {
    return { error: "storageKey must be a valid, non-traversing storage key of at most 2048 characters." };
  }
  if (typeof body.fileName !== "string" || !body.fileName.trim() ||
      body.fileName.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(body.fileName)) {
    return { error: "fileName must be a basename of at most 255 characters." };
  }
  if (body.mimeType !== undefined && body.mimeType !== null &&
      (typeof body.mimeType !== "string" || body.mimeType.length > 100 ||
       !mimePattern.test(body.mimeType))) {
    return { error: "mimeType must be a valid MIME type of at most 100 characters or null." };
  }
  let sizeBytes = null;
  if (body.sizeBytes !== undefined && body.sizeBytes !== null) {
    const size = String(body.sizeBytes);
    if (!/^(0|[1-9]\d{0,18})$/.test(size) || BigInt(size) > 9223372036854775807n) {
      return { error: "sizeBytes must be a non-negative 64-bit integer or null." };
    }
    sizeBytes = size;
  }
  return {
    value: {
      [parentFields[0]]: body[parentFields[0]],
      storageKey: body.storageKey.trim(),
      fileName: body.fileName.trim(),
      mimeType: body.mimeType || null,
      sizeBytes,
    },
  };
}

module.exports = {
  validateAttachmentCreate,
  validateAttachmentQuery,
  validateId,
  validateNotificationQuery,
  validatePageQuery,
  validateReviewCreate,
  validateReviewPatch,
  validateReviewQuery,
  validateTicketCreate,
  validateTicketMessage,
  validateTicketPatch,
  validateTicketQuery,
};
