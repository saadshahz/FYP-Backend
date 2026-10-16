const { pool } = require("../config/database");
const httpError = require("../utils/httpError");
const repository = require("../repositories/phase5Repository");

const writeRoles = new Set(["owner", "admin", "manager"]);

function pageResult(result, page, limit) {
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

async function selectConsumerMembership(userId, organizationId) {
  const memberships = await repository.findConsumerMemberships(userId);
  if (memberships.length === 0) {
    throw httpError(404, "No active organization membership was found.");
  }

  const consumerMemberships = memberships.filter(
    (item) => item.organizationType === "consumer"
  );
  if (consumerMemberships.length === 0) {
    throw httpError(409, "An active consumer organization membership is required for assets.");
  }

  if (!organizationId && memberships.length > 1) {
    throw httpError(409, "organizationId is required when you have multiple active organization memberships.");
  }
  const membership = memberships.find((item) => item.id === organizationId) || (
    organizationId ? null : memberships[0]
  );
  if (!membership) {
    throw httpError(404, "Active organization membership was not found.");
  }
  if (membership.organizationType !== "consumer") {
    throw httpError(409, "The selected organization is not a consumer organization.");
  }
  return membership;
}

function requireWriteRole(membership) {
  if (!writeRoles.has(membership.role)) {
    throw httpError(403, "A consumer organization owner, admin, or manager is required.");
  }
}

async function requireOwnedAsset(userId, assetId, writable = false) {
  const asset = await repository.getAsset(userId, assetId);
  if (!asset) {
    throw httpError(404, "Asset was not found.");
  }
  const membership = await selectConsumerMembership(userId, asset.organizationId);
  if (writable) {
    requireWriteRole(membership);
  }
  return { asset, membership };
}

async function listAssets(userId, filters) {
  const membership = await selectConsumerMembership(userId, filters.organizationId);
  const result = await repository.listAssets(userId, membership.id, filters);
  return pageResult(result, filters.page, filters.limit);
}

async function createAsset(userId, organizationId, input) {
  const membership = await selectConsumerMembership(userId, organizationId);
  requireWriteRole(membership);
  const asset = await repository.createAsset(userId, membership.id, input);
  if (!asset) {
    throw httpError(404, "Consumer organization was not found or is no longer accessible.");
  }
  return { data: asset };
}

async function getAsset(userId, assetId) {
  const { asset } = await requireOwnedAsset(userId, assetId);
  return { data: asset };
}

async function updateAsset(userId, assetId, input) {
  const { asset, membership } = await requireOwnedAsset(userId, assetId, true);
  const installDate = Object.hasOwn(input, "installDate") ? input.installDate : asset.installDate;
  const warrantyExpiry = Object.hasOwn(input, "warrantyExpiry")
    ? input.warrantyExpiry
    : asset.warrantyExpiry;
  if (installDate && warrantyExpiry && warrantyExpiry < installDate) {
    throw httpError(400, "warrantyExpiry cannot be earlier than installDate.");
  }
  const updated = await repository.updateAsset(userId, assetId, input);
  if (!updated) {
    throw httpError(404, "Asset was not found or is no longer editable.");
  }
  return { data: updated, membershipRole: membership.role };
}

async function retireAsset(userId, assetId) {
  await requireOwnedAsset(userId, assetId, true);
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    if (!(await repository.retireAsset(client, userId, assetId))) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      throw httpError(404, "Asset was not found or is already retired.");
    }
    await client.query("COMMIT");
    transactionOpen = false;
    return { data: { id: assetId, status: "retired" } };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Failed to roll back asset retirement.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listMaintenancePlans(userId, assetId) {
  await requireOwnedAsset(userId, assetId);
  return { data: await repository.listMaintenancePlans(userId, assetId) };
}

function planLockKey(assetId, providerOrganizationId, frequency) {
  return `${assetId}:${providerOrganizationId}:${frequency}`;
}

async function createMaintenancePlan(userId, assetId, input) {
  const { asset } = await requireOwnedAsset(userId, assetId, true);
  if (asset.status === "retired") {
    throw httpError(409, "Maintenance plans cannot be added to a retired asset.");
  }
  if (!(await repository.providerIsApproved(input.providerOrganizationId))) {
    throw httpError(400, "providerOrganizationId must refer to an active, approved provider.");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      planLockKey(assetId, input.providerOrganizationId, input.frequency),
    ]);
    if (
      await repository.hasActiveDuplicateMaintenancePlan(
        client,
        assetId,
        input.providerOrganizationId,
        input.frequency
      )
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      throw httpError(409, "An active maintenance plan with this provider and frequency already exists.");
    }
    const plan = await repository.createMaintenancePlan(client, userId, assetId, input);
    if (!plan) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      throw httpError(404, "Asset, membership, or approved provider was not found.");
    }
    await client.query("COMMIT");
    transactionOpen = false;
    return { data: await repository.getMaintenancePlan(userId, plan.id) };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Failed to roll back maintenance plan transaction.");
      }
      transactionOpen = false;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function updateMaintenancePlan(userId, planId, input) {
  const current = await repository.getMaintenancePlan(userId, planId);
  if (!current) {
    throw httpError(404, "Maintenance plan was not found.");
  }
  const { asset } = await requireOwnedAsset(userId, current.assetId, true);

  const providerOrganizationId = input.providerOrganizationId || current.providerOrganizationId;
  const frequency = input.frequency || current.frequency;
  const isActive = Object.hasOwn(input, "isActive") ? input.isActive : current.isActive;
  if (asset.status === "retired" && isActive) {
    throw httpError(409, "Maintenance plans cannot be activated for a retired asset.");
  }
  if (
    (isActive || Object.hasOwn(input, "providerOrganizationId")) &&
    !(await repository.providerIsApproved(providerOrganizationId))
  ) {
    throw httpError(400, "providerOrganizationId must refer to an active, approved provider.");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    if (isActive) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
        planLockKey(current.assetId, providerOrganizationId, frequency),
      ]);
      if (
        await repository.hasActiveDuplicateMaintenancePlan(
          client,
          current.assetId,
          providerOrganizationId,
          frequency,
          planId
        )
      ) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        throw httpError(409, "An active maintenance plan with this provider and frequency already exists.");
      }
    }
    const updated = await repository.updateMaintenancePlan(
      client,
      userId,
      planId,
      input,
      isActive || Object.hasOwn(input, "providerOrganizationId")
    );
    if (!updated) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      throw httpError(404, "Maintenance plan was not found or is no longer accessible.");
    }
    await client.query("COMMIT");
    transactionOpen = false;
    return { data: await repository.getMaintenancePlan(userId, updated.id) };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Failed to roll back maintenance plan transaction.");
      }
      transactionOpen = false;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateMaintenancePlan(userId, planId) {
  const current = await repository.getMaintenancePlan(userId, planId);
  if (!current) {
    throw httpError(404, "Maintenance plan was not found.");
  }
  await requireOwnedAsset(userId, current.assetId, true);
  if (!(await repository.deactivateMaintenancePlan(userId, planId))) {
    throw httpError(404, "Maintenance plan was not found or is no longer accessible.");
  }
  return { data: { id: planId, isActive: false } };
}

module.exports = {
  createAsset,
  createMaintenancePlan,
  deactivateMaintenancePlan,
  getAsset,
  listAssets,
  listMaintenancePlans,
  retireAsset,
  updateAsset,
  updateMaintenancePlan,
};
