const crypto = require("crypto");
const { pool } = require("../config/database");
const httpError = require("../utils/httpError");
const repository = require("../repositories/phase7Repository");

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
        console.error("Failed to roll back a contract or work-order transaction.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function selectMembership(userId, organizationId) {
  const memberships = await repository.findActiveMemberships(userId);
  if (memberships.length === 0) {
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

function requireWriteRole(membership) {
  if (!writeRoles.has(membership.role)) {
    throw httpError(403, "An organization owner, admin, or manager is required.");
  }
}

async function listContracts(userId, filters) {
  const admin = await repository.isActiveAdmin(userId);
  if (!filters.organizationId && !admin) {
    await selectMembership(userId, undefined);
  }
  if (filters.organizationId && !admin) {
    await selectMembership(userId, filters.organizationId);
  }
  const result = await repository.listContracts(
    userId,
    filters.organizationId,
    filters,
    admin
  );
  return paginated(result, filters.page, filters.limit);
}

async function getContract(userId, contractId) {
  if (!(await repository.getAccessibleContract(userId, contractId))) {
    throw httpError(404, "Contract was not found.");
  }
  const contract = await repository.getContractById(contractId);
  if (!contract) {
    throw httpError(404, "Contract was not found.");
  }
  return { data: contract };
}

async function createContract(userId, input) {
  const contractNumber =
    `CT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const result = await withTransaction((client) =>
    repository.createContract(client, userId, input.quoteId, contractNumber, input)
  );
  if (result.unavailable) {
    throw httpError(409, "An accepted quote from an active, approved provider and its consumer organization is required.");
  }
  if (result.duplicate) {
    throw httpError(409, "A contract already exists for this accepted quote or service request.");
  }
  return { data: await repository.getContractById(result.id) };
}

async function updateContract(userId, contractId, input) {
  if (!(await repository.getAccessibleContract(userId, contractId))) {
    throw httpError(404, "Contract was not found.");
  }
  const current = await repository.getContractById(contractId);
  if (!current) {
    throw httpError(404, "Contract was not found.");
  }
  const membership = await repository.findMembership(userId, current.consumerOrganizationId);
  if (!membership) {
    throw httpError(403, "Only the consumer organization can edit a draft contract.");
  }
  requireWriteRole(membership);
  const startDate = Object.hasOwn(input, "startDate") ? input.startDate : current.startDate;
  const endDate = Object.hasOwn(input, "endDate") ? input.endDate : current.endDate;
  if (startDate && endDate && endDate < startDate) {
    throw httpError(400, "endDate cannot be earlier than startDate.");
  }
  const updated = await withTransaction((client) =>
    repository.updateDraftContract(client, userId, contractId, input)
  );
  if (!updated) {
    throw httpError(409, "Only a draft contract can be edited by its consumer organization.");
  }
  return { data: await repository.getContractById(contractId) };
}

async function transitionContract(userId, contractId, action) {
  const result = await withTransaction((client) =>
    repository.transitionContract(client, userId, contractId, action)
  );
  if (result.missing) {
    throw httpError(404, "Contract was not found or is not available to this organization.");
  }
  if (result.conflict) {
    if (result.status === "work_not_completed") {
      throw httpError(409, "The contract cannot be completed until its work order is completed.");
    }
    if (result.status === "work_order_in_progress") {
      throw httpError(409, "Cancel or complete the active work order before cancelling the contract.");
    }
    if (result.status === "work_completed") {
      throw httpError(409, "The completed work order must be confirmed by completing the contract.");
    }
    const actions = { send: "sent", accept: "accepted", activate: "activated", cancel: "cancelled" };
    actions.complete = "completed";
    throw httpError(409, `A contract with status '${result.status}' cannot be ${actions[action]}.`);
  }
  return { data: await repository.getContractById(contractId) };
}

async function listWorkOrders(userId, filters) {
  const admin = await repository.isActiveAdmin(userId);
  if (!filters.organizationId && !admin) {
    await selectMembership(userId, undefined);
  }
  if (filters.organizationId && !admin) {
    await selectMembership(userId, filters.organizationId);
  }
  const result = await repository.listWorkOrders(
    userId,
    filters.organizationId,
    filters,
    admin
  );
  if (!result) {
    throw httpError(404, "Active organization membership was not found.");
  }
  return paginated(result, filters.page, filters.limit);
}

async function getWorkOrder(userId, workOrderId) {
  if (!(await repository.getAccessibleWorkOrder(userId, workOrderId))) {
    throw httpError(404, "Work order was not found.");
  }
  const workOrder = await repository.getWorkOrderById(workOrderId);
  if (!workOrder) {
    throw httpError(404, "Work order was not found.");
  }
  return { data: workOrder };
}

async function createWorkOrder(userId, contractId, input) {
  const workOrderNumber =
    `WO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const result = await withTransaction((client) =>
    repository.createWorkOrder(client, userId, contractId, workOrderNumber, input)
  );
  if (result.unavailable) {
    throw httpError(409, "An active contract, accepted service request, and authorized provider membership are required.");
  }
  if (result.duplicate) {
    throw httpError(409, "A work order already exists for this service request and provider.");
  }
  return { data: await repository.getWorkOrderById(result.id) };
}

async function updateWorkOrder(userId, workOrderId, input) {
  const current = await repository.getAccessibleWorkOrder(userId, workOrderId);
  if (!current) {
    throw httpError(404, "Work order was not found.");
  }
  const order = await repository.getWorkOrderById(workOrderId);
  const startAt = Object.hasOwn(input, "scheduledStartAt")
    ? input.scheduledStartAt
    : order.scheduledStartAt;
  const endAt = Object.hasOwn(input, "scheduledEndAt")
    ? input.scheduledEndAt
    : order.scheduledEndAt;
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
    throw httpError(400, "scheduledEndAt cannot be earlier than scheduledStartAt.");
  }
  const result = await withTransaction((client) =>
    repository.updateWorkOrder(client, userId, workOrderId, input)
  );
  if (result.missing) {
    throw httpError(403, "Only provider organization owners, admins, or managers can edit work orders.");
  }
  if (result.conflict) {
    throw httpError(409, `A work order with status '${result.status}' can no longer be edited.`);
  }
  return { data: await repository.getWorkOrderById(workOrderId) };
}

async function assignTechnician(userId, workOrderId, input) {
  const result = await withTransaction((client) =>
    repository.assignTechnician(client, userId, workOrderId, input)
  );
  if (result.missing) {
    throw httpError(404, "Work order was not found or is not available to the provider organization.");
  }
  if (result.conflict) {
    throw httpError(409, `A work order with status '${result.status}' cannot be assigned.`);
  }
  if (result.invalidTechnician) {
    throw httpError(400, "technicianId must identify an active technician in this provider organization.");
  }
  if (result.invalidSchedule) {
    throw httpError(400, "scheduledEndAt cannot be earlier than scheduledStartAt.");
  }
  return { data: await repository.getWorkOrderById(workOrderId) };
}

async function transitionWorkOrder(userId, workOrderId, action, input) {
  const result = await withTransaction((client) =>
    repository.transitionWorkOrder(client, userId, workOrderId, action, input)
  );
  if (result.missing) {
    throw httpError(404, "Work order was not found or is not available to this account.");
  }
  if (result.conflict) {
    const actions = { start: "started", complete: "completed", cancel: "cancelled" };
    throw httpError(409, `A work order with status '${result.status}' cannot be ${actions[action]}.`);
  }
  return { data: await repository.getWorkOrderById(workOrderId) };
}

async function listWorkOrderEvents(userId, workOrderId) {
  if (!(await repository.getAccessibleWorkOrder(userId, workOrderId))) {
    throw httpError(404, "Work order was not found.");
  }
  return { data: await repository.listWorkOrderEvents(workOrderId) };
}

module.exports = {
  assignTechnician,
  createContract,
  createWorkOrder,
  getContract,
  getWorkOrder,
  listContracts,
  listWorkOrderEvents,
  listWorkOrders,
  transitionContract,
  transitionWorkOrder,
  updateContract,
  updateWorkOrder,
};
