const service = require("../services/phase4Service");
const { validateUuid } = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function changeStatus(status) {
  return send((req, res) => {
    const idError = validateUuid(req.params.organizationId, "organizationId");
    if (idError) {
      return res.status(400).json({ error: idError });
    }
    return service
      .approveProvider(req.auth.userId, req.params.organizationId, status)
      .then((result) => res.status(200).json(result));
  });
}

module.exports = {
  approveProvider: changeStatus("approved"),
  rejectProvider: changeStatus("rejected"),
};
