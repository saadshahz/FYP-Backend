const crypto = require("crypto");
const { pool } = require("../config/database");
const httpError = require("../utils/httpError");
const repository = require("../repositories/phase6Repository");

const writeRoles = new Set(["owner", "admin", "manager"]);

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

async function selectMembership(userId, organizationId, type) {
  const memberships = await repository.findActiveMemberships(userId);
  if (memberships.length === 0) {
    throw httpError(404, "No active organization membership was found.");
  }
  const matching = memberships.filter((item) => item.organizationType === type);
  if (matching.length === 0) {
    throw httpError(409, `An active ${type} organization membership is required.`);
  }
  if (!organizationId && memberships.length > 1) {
    throw httpError(409, "organizationId is required when you have multiple active organization memberships.");
  }
  const membership = memberships.find((item) => item.id === organizationId) ||
    (organizationId ? null : memberships[0]);
  if (!membership) {
    throw httpError(404, "Active organization membership was not found.");
  }
  if (membership.organizationType !== type) {
    throw httpError(409, `The selected organization is not a ${type} organization.`);
  }
  return membership;
}

function requireWriteRole(membership) {
  if (!writeRoles.has(membership.role)) {
    throw httpError(403, "An organization owner, admin, or manager is required.");
  }
}

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
        console.error("Failed to roll back a service-request transaction.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function validateRequestReferences(userId, organizationId, input) {
  if (input.assetId && !(await repository.getOwnedEligibleAsset(userId, organizationId, input.assetId))) {
    throw httpError(400, "assetId must refer to an active asset owned by the selected consumer organization.");
  }
  if (
    Object.hasOwn(input, "serviceCategoryId") &&
    input.serviceCategoryId &&
    !(await repository.isActiveCategory(input.serviceCategoryId))
  ) {
    throw httpError(400, "serviceCategoryId must refer to an active service category.");
  }
}

async function createRequest(userId, organizationId, input) {
  const membership = await selectMembership(userId, organizationId, "consumer");
  requireWriteRole(membership);
  await validateRequestReferences(userId, membership.id, input);
  if (input.providerOrganizationId) {
    if (!(await repository.providerIsApproved(input.providerOrganizationId))) {
      throw httpError(400, "providerOrganizationId must refer to an active, approved provider.");
    }
    if (
      !(await repository.providerOffersRequest(
        input.providerOrganizationId,
        input.serviceCategoryId,
        input.serviceType
      ))
    ) {
      throw httpError(400, "The selected provider does not offer the requested category or service type.");
    }
  }
  const requestNumber = `SR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const request = await repository.createRequest(userId, membership.id, requestNumber, input);
  if (!request) {
    throw httpError(404, "Consumer organization was not found or is no longer accessible.");
  }
  return { data: request };
}

async function listRequests(userId, filters) {
  const admin = await repository.isActiveAdmin(userId);
  if (admin && !filters.organizationId) {
    return paginated(await repository.listAdminRequests(filters), filters.page, filters.limit);
  }
  const membership = await selectMembership(userId, filters.organizationId, "consumer");
  return paginated(
    await repository.listConsumerRequests(userId, membership.id, filters),
    filters.page,
    filters.limit
  );
}

async function getRequest(userId, requestId) {
  if (await repository.isActiveAdmin(userId)) {
    const request = await repository.getRequestById(requestId);
    if (!request) {
      throw httpError(404, "Service request was not found.");
    }
    return { data: request };
  }
  if (await repository.getRequestForConsumer(userId, requestId)) {
    return { data: await repository.getRequestById(requestId) };
  }
  const memberships = await repository.findActiveMemberships(userId);
  for (const membership of memberships.filter((item) => item.organizationType === "provider")) {
    if (await repository.getRequestForProvider(userId, requestId, membership.id)) {
      return { data: await repository.getRequestById(requestId) };
    }
    if (await repository.isProviderEligibleForRequest(membership.id, requestId)) {
      return { data: await repository.getRequestById(requestId) };
    }
  }
  throw httpError(404, "Service request was not found.");
}

async function updateRequest(userId, requestId, input) {
  const request = await repository.getRequestById(requestId);
  if (!request || !(await repository.getRequestForConsumer(userId, requestId))) {
    throw httpError(404, "Service request was not found.");
  }
  const memberships = await repository.findActiveMemberships(userId);
  const membership = memberships.find(
    (item) => item.id === request.consumerOrganizationId && item.organizationType === "consumer"
  );
  if (!membership) {
    throw httpError(404, "Service request was not found.");
  }
  requireWriteRole(membership);
  await validateRequestReferences(userId, membership.id, input);
  const categoryId = Object.hasOwn(input, "serviceCategoryId")
    ? input.serviceCategoryId
    : request.serviceCategoryId;
  const serviceType = Object.hasOwn(input, "serviceType") ? input.serviceType : request.serviceType;
  if (!categoryId && !serviceType) {
    throw httpError(400, "serviceCategoryId or serviceType is required so providers can match the request.");
  }
  if (
    request.providerOrganizationId &&
    (
      !(await repository.providerIsApproved(request.providerOrganizationId)) ||
      !(await repository.providerOffersRequest(
        request.providerOrganizationId,
        categoryId,
        serviceType
      ))
    )
  ) {
    throw httpError(400, "The targeted provider must be active, approved, and offer the requested category or service type.");
  }
  const updated = await repository.updateConsumerRequest(userId, requestId, input);
  if (!updated) {
    throw httpError(409, "Only submitted service requests can be updated.");
  }
  return { data: updated };
}

async function cancelRequest(userId, requestId) {
  const result = await repository.cancelRequest(userId, requestId);
  if (result.missing) {
    throw httpError(404, "Service request was not found or cannot be cancelled by this account.");
  }
  if (result.conflict) {
    throw httpError(409, `A service request with status '${result.status}' cannot be cancelled.`);
  }
  return result;
}

async function discoverRequests(userId, filters) {
  const membership = await selectMembership(userId, filters.organizationId, "provider");
  if (!(await repository.providerIsApproved(membership.id))) {
    throw httpError(403, "An approved provider organization is required to discover requests.");
  }
  return paginated(
    await repository.listProviderRequests(userId, membership.id, filters),
    filters.page,
    filters.limit
  );
}

async function authorizeProviderRequest(userId, requestId, providerOrganizationId) {
  const membership = await selectMembership(userId, providerOrganizationId, "provider");
  requireWriteRole(membership);
  if (!(await repository.isProviderEligibleForRequest(membership.id, requestId))) {
    throw httpError(404, "Service request is unavailable to this provider.");
  }
  return membership;
}

async function listQuotes(userId, requestId) {
  if (await repository.getRequestForConsumer(userId, requestId)) {
    return { data: await repository.listRequestQuotes(requestId, null) };
  }
  const memberships = await repository.findActiveMemberships(userId);
  const providerOrganizations = [];
  for (const membership of memberships.filter((item) => item.organizationType === "provider")) {
    if (await repository.getRequestForProvider(userId, requestId, membership.id)) {
      providerOrganizations.push(membership.id);
    }
  }
  if (providerOrganizations.length === 0) {
    throw httpError(404, "Service request was not found.");
  }
  const quotes = await Promise.all(
    providerOrganizations.map((organizationId) =>
      repository.listRequestQuotes(requestId, organizationId)
    )
  );
  return { data: quotes.flat() };
}

async function createQuote(userId, requestId, providerOrganizationId, input) {
  const membership = await authorizeProviderRequest(userId, requestId, providerOrganizationId);
  const result = await withTransaction(async (client) => {
    const locked = await repository.lockRequestForProviderQuote(
      client,
      requestId,
      userId,
      membership.id
    );
    if (!locked) {
      throw httpError(409, "The service request is no longer available to this provider.");
    }
    const quoteId = await repository.createQuote(
      client,
      requestId,
      membership.id,
      userId,
      input
    );
    if (!quoteId) {
      throw httpError(409, "A quote already exists for this provider, or the request is no longer available.");
    }
    return quoteId;
  });
  return { data: await repository.getQuoteById(result) };
}

async function getQuote(userId, quoteId) {
  const quote = await repository.getQuoteById(quoteId);
  if (!quote) {
    throw httpError(404, "Quote was not found.");
  }
  if (await repository.getRequestForProvider(userId, quote.serviceRequestId, quote.providerOrganizationId)) {
    return { data: quote };
  }
  if (
    quote.status === "draft" ||
    !(await repository.getRequestForConsumer(userId, quote.serviceRequestId))
  ) {
    throw httpError(404, "Quote was not found.");
  }
  return { data: quote };
}

async function updateQuote(userId, quoteId, providerOrganizationId, input) {
  const membership = await selectMembership(userId, providerOrganizationId, "provider");
  requireWriteRole(membership);
  const result = await withTransaction(async (client) => {
    const updated = await repository.updateDraftQuote(client, quoteId, userId, membership.id, input);
    if (updated && updated.amountOverflow) {
      throw httpError(400, "Quote total exceeds the supported amount.");
    }
    return updated;
  });
  if (!result) {
    throw httpError(404, "Draft quote was not found or is no longer editable.");
  }
  return { data: await repository.getQuoteById(quoteId) };
}

async function submitQuote(userId, quoteId, providerOrganizationId) {
  const membership = await selectMembership(userId, providerOrganizationId, "provider");
  requireWriteRole(membership);
  const result = await withTransaction((client) =>
    repository.submitQuote(client, quoteId, userId, membership.id)
  );
  if (!result) {
    throw httpError(404, "Draft quote was not found or is no longer submittable.");
  }
  return { data: await repository.getQuoteById(quoteId) };
}

async function decideQuote(userId, quoteId, decision) {
  const quote = await repository.getQuoteById(quoteId);
  if (!quote || !(await repository.getRequestForConsumer(userId, quote.serviceRequestId))) {
    throw httpError(404, "Quote was not found.");
  }
  const memberships = await repository.findActiveMemberships(userId);
  const membership = memberships.find(
    (item) => item.id === quote.consumerOrganizationId && item.organizationType === "consumer"
  );
  if (!membership) {
    throw httpError(404, "Quote was not found.");
  }
  requireWriteRole(membership);
  const result = await withTransaction((client) =>
    repository.decideQuote(client, quoteId, userId, decision)
  );
  if (result.missing) {
    throw httpError(404, "Quote was not found.");
  }
  if (result.conflict) {
    throw httpError(409, `Quote or request cannot be ${decision} in its current status.`);
  }
  return { data: await repository.getQuoteById(result.quoteId) };
}

async function listMessages(userId, requestId) {
  if (!(await repository.userCanAccessMessages(userId, requestId))) {
    throw httpError(404, "Service request was not found.");
  }
  return { data: await repository.listMessages(requestId) };
}

async function createMessage(userId, requestId, message) {
  const created = await repository.createMessage(userId, requestId, message);
  if (!created) {
    throw httpError(404, "Service request was not found or is not available to this account.");
  }
  return { data: created };
}

module.exports = {
  cancelRequest,
  createMessage,
  createQuote,
  createRequest,
  discoverRequests,
  decideQuote,
  getQuote,
  getRequest,
  listMessages,
  listQuotes,
  listRequests,
  submitQuote,
  updateQuote,
  updateRequest,
};
