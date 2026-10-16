const service = require("../services/phase7Service");
const {
  validateAssignment,
  validateCompletion,
  validateContractCreate,
  validateContractPatch,
  validateOrganizationQuery,
  validateUuidParam,
  validateWorkOrderCreate,
  validateWorkOrderPatch,
} = require("../validators/phase7");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function validId(req, res, param) {
  const error = validateUuidParam(req.params[param], param);
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

async function listContracts(req, res) {
  const validation = validateOrganizationQuery(req.query, "contracts");
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listContracts(req.auth.userId, validation.value));
}

async function getContract(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  return res.status(200).json(await service.getContract(req.auth.userId, req.params.id));
}

async function createContract(req, res) {
  const validation = validateContractCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(await service.createContract(req.auth.userId, validation.value));
}

async function patchContract(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  const validation = validateContractPatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(200)
    .json(await service.updateContract(req.auth.userId, req.params.id, validation.value));
}

function contractAction(action) {
  return send(async (req, res) => {
    if (!validId(req, res, "id")) {
      return;
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json({ error: "This contract action does not accept a request body." });
    }
    return res
      .status(200)
      .json(await service.transitionContract(req.auth.userId, req.params.id, action));
  });
}

async function listWorkOrders(req, res) {
  const validation = validateOrganizationQuery(req.query, "workOrders");
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listWorkOrders(req.auth.userId, validation.value));
}

async function getWorkOrder(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  return res.status(200).json(await service.getWorkOrder(req.auth.userId, req.params.id));
}

async function createWorkOrder(req, res) {
  if (!validId(req, res, "contractId")) {
    return;
  }
  const validation = validateWorkOrderCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(201)
    .json(
      await service.createWorkOrder(
        req.auth.userId,
        req.params.contractId,
        validation.value
      )
    );
}

async function patchWorkOrder(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  const validation = validateWorkOrderPatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(200)
    .json(await service.updateWorkOrder(req.auth.userId, req.params.id, validation.value));
}

async function assignWorkOrder(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  const validation = validateAssignment(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(200)
    .json(await service.assignTechnician(req.auth.userId, req.params.id, validation.value));
}

function workOrderAction(action) {
  return send(async (req, res) => {
    if (!validId(req, res, "id")) {
      return;
    }
    const validation = action === "complete"
      ? validateCompletion(req.body)
      : validateActionNote(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    return res
      .status(200)
      .json(
        await service.transitionWorkOrder(
          req.auth.userId,
          req.params.id,
          action,
          validation.value
        )
      );
  });
}

async function listEvents(req, res) {
  if (!validId(req, res, "id")) {
    return;
  }
  return res
    .status(200)
    .json(await service.listWorkOrderEvents(req.auth.userId, req.params.id));
}

module.exports = {
  acceptContract: contractAction("accept"),
  activateContract: contractAction("activate"),
  assignWorkOrder: send(assignWorkOrder),
  cancelContract: contractAction("cancel"),
  cancelWorkOrder: workOrderAction("cancel"),
  completeWorkOrder: workOrderAction("complete"),
  completeContract: contractAction("complete"),
  createContract: send(createContract),
  createWorkOrder: send(createWorkOrder),
  getContract: send(getContract),
  getWorkOrder: send(getWorkOrder),
  listContracts: send(listContracts),
  listEvents: send(listEvents),
  listWorkOrders: send(listWorkOrders),
  patchContract: send(patchContract),
  patchWorkOrder: send(patchWorkOrder),
  sendContract: contractAction("send"),
  startWorkOrder: workOrderAction("start"),
};
