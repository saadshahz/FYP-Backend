const service = require("../services/phase5Service");
const {
  validateAssetInput,
  validateAssetQuery,
  validateOrganizationSelection,
  validateUuidParam,
} = require("../validators/phase5");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function list(req, res) {
  const validation = validateAssetQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .listAssets(req.auth.userId, validation.value)
    .then((result) => res.status(200).json(result));
}

function create(req, res) {
  const selection = validateOrganizationSelection(req.query);
  if (selection.error) {
    return res.status(400).json({ error: selection.error });
  }
  const validation = validateAssetInput(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .createAsset(req.auth.userId, selection.value, validation.value)
    .then((result) => res.status(201).json(result));
}

function get(req, res) {
  const idError = validateUuidParam(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  return service
    .getAsset(req.auth.userId, req.params.id)
    .then((result) => res.status(200).json(result));
}

function patch(req, res) {
  const idError = validateUuidParam(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  const validation = validateAssetInput(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .updateAsset(req.auth.userId, req.params.id, validation.value)
    .then((result) => res.status(200).json({ data: result.data }));
}

function retire(req, res) {
  const idError = validateUuidParam(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  return service
    .retireAsset(req.auth.userId, req.params.id)
    .then((result) => res.status(200).json(result));
}

module.exports = {
  create: send(create),
  get: send(get),
  list: send(list),
  patch: send(patch),
  retire: send(retire),
};
