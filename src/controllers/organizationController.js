const service = require("../services/phase4Service");
const {
  validateOrganizationPatch,
  validateOrganizationSelection,
} = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function getMe(req, res) {
  const selection = validateOrganizationSelection(req.query);
  if (selection.error) {
    return res.status(400).json({ error: selection.error });
  }
  return service
    .getOrganization(req.auth.userId, selection.value)
    .then((result) => res.status(200).json(result));
}

function patchMe(req, res) {
  const selection = validateOrganizationSelection(req.query);
  if (selection.error) {
    return res.status(400).json({ error: selection.error });
  }
  const validation = validateOrganizationPatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return service
    .patchOrganization(req.auth.userId, selection.value, validation.value)
    .then((result) => res.status(200).json(result));
}

module.exports = { getMe: send(getMe), patchMe: send(patchMe) };
