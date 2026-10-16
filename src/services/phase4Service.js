const repository = require("../repositories/phase4Repository");
const httpError = require("../utils/httpError");

const managementRoles = new Set(["owner", "admin", "manager"]);

function paginationResult(result, page, limit) {
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
  const memberships = await repository.findMemberships(userId);
  if (memberships.length === 0) {
    throw httpError(404, "No active organization membership was found.");
  }
  if (!organizationId && memberships.length > 1) {
    throw httpError(409, "organizationId is required when you have multiple active memberships.");
  }

  const membership = memberships.find((item) => item.id === organizationId) || (
    organizationId ? null : memberships[0]
  );
  if (!membership) {
    throw httpError(404, "Organization membership was not found.");
  }
  return membership;
}

async function selectProviderMembership(userId, organizationId) {
  const membership = await selectMembership(userId, organizationId);
  if (membership.organization_type !== "provider") {
    throw httpError(409, "This operation requires a provider organization.");
  }
  return membership;
}

async function requireManager(membership) {
  if (!managementRoles.has(membership.role)) {
    throw httpError(403, "An organization owner, admin, or manager is required.");
  }
}

async function getIndustries(filters) {
  return paginationResult(await repository.listIndustries(filters), filters.page, filters.limit);
}

async function getServiceCategories(filters) {
  return paginationResult(
    await repository.listServiceCategories(filters),
    filters.page,
    filters.limit
  );
}

async function getOrganization(userId, organizationId) {
  const membership = await selectMembership(userId, organizationId);
  const organization = await repository.getOrganization(userId, membership.id);
  if (!organization) {
    throw httpError(404, "Organization was not found.");
  }
  return { data: organization };
}

async function patchOrganization(userId, organizationId, input) {
  const membership = await selectMembership(userId, organizationId);
  await requireManager(membership);
  if (Object.hasOwn(input, "industryId") && input.industryId !== null) {
    if (!(await repository.isActiveIndustry(input.industryId))) {
      throw httpError(400, "industryId must refer to an active industry.");
    }
  }
  const organization = await repository.updateOrganization(userId, membership.id, input);
  if (!organization) {
    throw httpError(404, "Organization was not found or is no longer accessible.");
  }
  return { data: organization };
}

async function getProviderProfile(userId, organizationId) {
  const membership = await selectProviderMembership(userId, organizationId);
  const profile = await repository.getProviderProfile(userId, membership.id);
  if (!profile) {
    throw httpError(404, "Provider profile was not found.");
  }
  return { data: profile };
}

async function patchProviderProfile(userId, organizationId, input) {
  const membership = await selectProviderMembership(userId, organizationId);
  await requireManager(membership);
  const profile = await repository.updateProviderProfile(userId, membership.id, input);
  if (!profile) {
    throw httpError(404, "Provider profile was not found or is no longer accessible.");
  }
  return { data: profile };
}

async function getProviderServices(userId, organizationId) {
  const membership = await selectProviderMembership(userId, organizationId);
  return { data: await repository.listProviderServices(userId, membership.id) };
}

async function createProviderService(userId, organizationId, input) {
  const membership = await selectProviderMembership(userId, organizationId);
  await requireManager(membership);
  if (input.serviceCategoryId && !(await repository.isActiveServiceCategory(input.serviceCategoryId))) {
    throw httpError(400, "serviceCategoryId must refer to an active service category.");
  }
  const service = await repository.createProviderService(userId, membership.id, input);
  if (!service) {
    throw httpError(404, "Provider organization was not found or is no longer accessible.");
  }
  return { data: service };
}

async function patchProviderService(userId, organizationId, serviceId, input) {
  const membership = await selectProviderMembership(userId, organizationId);
  await requireManager(membership);
  if (
    Object.hasOwn(input, "serviceCategoryId") &&
    input.serviceCategoryId !== null &&
    !(await repository.isActiveServiceCategory(input.serviceCategoryId))
  ) {
    throw httpError(400, "serviceCategoryId must refer to an active service category.");
  }
  const service = await repository.updateProviderService(
    userId,
    membership.id,
    serviceId,
    input
  );
  if (!service) {
    throw httpError(404, "Active provider service was not found.");
  }
  return { data: service };
}

async function deleteProviderService(userId, organizationId, serviceId) {
  const membership = await selectProviderMembership(userId, organizationId);
  await requireManager(membership);
  if (!(await repository.deactivateProviderService(userId, membership.id, serviceId))) {
    throw httpError(404, "Active provider service was not found.");
  }
  return { data: { id: serviceId, isActive: false } };
}

async function getMarketplaceProviders(filters) {
  return paginationResult(
    await repository.listMarketplaceProviders(filters),
    filters.page,
    filters.limit
  );
}

async function getMarketplaceProvider(organizationId) {
  const provider = await repository.getMarketplaceProvider(organizationId);
  if (!provider) {
    throw httpError(404, "Approved provider was not found.");
  }
  return { data: provider };
}

async function approveProvider(actorUserId, organizationId, status) {
  const result = await repository.approveProvider(actorUserId, organizationId, status);
  if (result.data) {
    return { data: result.data };
  }
  if (!result.current) {
    throw httpError(404, "Provider profile was not found.");
  }
  if (result.current.actorIsMember) {
    throw httpError(403, "An administrator cannot approve or reject their own provider organization.");
  }
  throw httpError(409, `Provider profile cannot transition from ${result.current.status} to ${status}.`);
}

module.exports = {
  approveProvider,
  createProviderService,
  deleteProviderService,
  getIndustries,
  getMarketplaceProvider,
  getMarketplaceProviders,
  getOrganization,
  getProviderProfile,
  getProviderServices,
  getServiceCategories,
  patchOrganization,
  patchProviderProfile,
  patchProviderService,
};
