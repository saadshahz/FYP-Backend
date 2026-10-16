const service = require("../services/phase4Service");
const { validateCatalogQuery } = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function getIndustries(req, res) {
  const validation = validateCatalogQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service.getIndustries(validation.value).then((result) => res.status(200).json(result));
}

function getServiceCategories(req, res) {
  const validation = validateCatalogQuery(req.query, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .getServiceCategories(validation.value)
    .then((result) => res.status(200).json(result));
}

module.exports = {
  getIndustries: send(getIndustries),
  getServiceCategories: send(getServiceCategories),
};
