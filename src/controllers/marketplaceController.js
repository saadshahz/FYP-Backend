const service = require("../services/phase4Service");
const { validateMarketplaceQuery, validateUuid } = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function listProviders(req, res) {
  const validation = validateMarketplaceQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .getMarketplaceProviders(validation.value)
    .then((result) => res.status(200).json(result));
}

function getProvider(req, res) {
  const idError = validateUuid(req.params.id, "id");
  if (idError) {
    return res.status(400).json({ error: idError });
  }
  return service
    .getMarketplaceProvider(req.params.id)
    .then((result) => res.status(200).json(result));
}

module.exports = { getProvider: send(getProvider), listProviders: send(listProviders) };
