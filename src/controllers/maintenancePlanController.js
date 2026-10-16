const service = require("../services/phase5Service");
const {
  validateMaintenancePlanInput,
  validateUuidParam,
} = require("../validators/phase5");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function validateId(req, res, fieldName, value) {
  const error = validateUuidParam(value, fieldName);
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

function listForAsset(req, res) {
  if (!validateId(req, res, "assetId", req.params.id)) {
    return undefined;
  }
  return service
    .listMaintenancePlans(req.auth.userId, req.params.id)
    .then((result) => res.status(200).json(result));
}

function createForAsset(req, res) {
  if (!validateId(req, res, "assetId", req.params.id)) {
    return undefined;
  }
  const validation = validateMaintenancePlanInput(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .createMaintenancePlan(req.auth.userId, req.params.id, validation.value)
    .then((result) => res.status(201).json(result));
}

function patch(req, res) {
  if (!validateId(req, res, "id", req.params.id)) {
    return undefined;
  }
  const validation = validateMaintenancePlanInput(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .updateMaintenancePlan(req.auth.userId, req.params.id, validation.value)
    .then((result) => res.status(200).json(result));
}

function deactivate(req, res) {
  if (!validateId(req, res, "id", req.params.id)) {
    return undefined;
  }
  return service
    .deactivateMaintenancePlan(req.auth.userId, req.params.id)
    .then((result) => res.status(200).json(result));
}

module.exports = {
  createForAsset: send(createForAsset),
  deactivate: send(deactivate),
  listForAsset: send(listForAsset),
  patch: send(patch),
};
