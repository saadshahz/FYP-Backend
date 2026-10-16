const service = require("../services/phase4Service");
const {
  validateOrganizationSelection,
  validateProviderProfilePatch,
  validateServiceInput,
  validateUuid,
} = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function selection(req, res) {
  const validation = validateOrganizationSelection(req.query);
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return null;
  }
  return validation.value;
}

function getProfile(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  return service
    .getProviderProfile(req.auth.userId, organizationId)
    .then((result) => res.status(200).json(result));
}

function patchProfile(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  const validation = validateProviderProfilePatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .patchProviderProfile(req.auth.userId, organizationId, validation.value)
    .then((result) => res.status(200).json(result));
}

function getServices(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  return service
    .getProviderServices(req.auth.userId, organizationId)
    .then((result) => res.status(200).json (result));
}

function createService(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  const validation = validateServiceInput(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .createProviderService(req.auth.userId, organizationId, validation.value)
    .then((result) => res.status(201).json(result));
}

function patchService(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  const idError = validateUuid(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  const validation = validateServiceInput(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .patchProviderService(req.auth.userId, organizationId, req.params.id, validation.value)
    .then((result) => res.status(200).json(result));
}

function deleteService(req, res) {
  const organizationId = selection(req, res);
  if (organizationId === null) {
    return undefined;
  }
  const idError = validateUuid(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  return service
    .deleteProviderService(req.auth.userId, organizationId, req.params.id)
    .then((result) => res.status(200).json(result));
}

module.exports = {
  createService: send(createService),
  deleteService: send(deleteService),
  getProfile: send(getProfile),
  getServices: send(getServices),
  patchProfile: send(patchProfile),
  patchService: send(patchService),
};
