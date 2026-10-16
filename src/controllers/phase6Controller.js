const service = require("../services/phase6Service");
const {
  validateId,
  validateMessage,
  validateQuote,
  validateRequestQuery,
  validateServiceRequest,
} = require("../validators/phase6");
const { validateUuid } = require("../validators/phase4");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function validateParam(req, res, name = "id") {
  const error = validateId(req.params[name], name);
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

function organizationSelection(req, res) {
  if (req.query.organizationId === undefined) {
    return null;
  }
  const error = validateUuid(req.query.organizationId, "organizationId");
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return req.query.organizationId;
}

async function listRequests(req, res) {
  const validation = validateRequestQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listRequests(req.auth.userId, validation.value));
}

async function createRequest(req, res) {
  const organizationId = organizationSelection(req, res);
  if (organizationId === false) {
    return;
  }
  const validation = validateServiceRequest(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(201)
    .json(await service.createRequest(req.auth.userId, organizationId, validation.value));
}

async function getRequest(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(await service.getRequest(req.auth.userId, req.params.id));
}

async function patchRequest(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  const validation = validateServiceRequest(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(200)
    .json(await service.updateRequest(req.auth.userId, req.params.id, validation.value));
}

async function cancelRequest(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(await service.cancelRequest(req.auth.userId, req.params.id));
}

async function discoverRequests(req, res) {
  const validation = validateRequestQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.discoverRequests(req.auth.userId, validation.value));
}

async function listQuotes(req, res) {
  if (!validateParam(req, res, "requestId")) {
    return;
  }
  return res.status(200).json(await service.listQuotes(req.auth.userId, req.params.requestId));
}

async function createQuote(req, res) {
  if (!validateParam(req, res, "requestId")) {
    return;
  }
  const organizationId = organizationSelection(req, res);
  if (organizationId === false) {
    return;
  }
  const validation = validateQuote(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(201)
    .json(
      await service.createQuote(
        req.auth.userId,
        req.params.requestId,
        organizationId,
        validation.value
      )
    );
}

async function getQuote(req, res) {
  if (!validateParam(req, res, "quoteId")) {
    return;
  }
  return res.status(200).json(await service.getQuote(req.auth.userId, req.params.quoteId));
}

async function patchQuote(req, res) {
  if (!validateParam(req, res, "quoteId")) {
    return;
  }
  const organizationId = organizationSelection(req, res);
  if (organizationId === false) {
    return;
  }
  const validation = validateQuote(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(200)
    .json(
      await service.updateQuote(
        req.auth.userId,
        req.params.quoteId,
        organizationId,
        validation.value
      )
    );
}

async function submitQuote(req, res) {
  if (!validateParam(req, res, "quoteId")) {
    return;
  }
  const organizationId = organizationSelection(req, res);
  if (organizationId === false) {
    return;
  }
  return res
    .status(200)
    .json(await service.submitQuote(req.auth.userId, req.params.quoteId, organizationId));
}

async function decideQuote(req, res, decision) {
  if (!validateParam(req, res, "quoteId")) {
    return;
  }
  return res.status(200).json(await service.decideQuote(req.auth.userId, req.params.quoteId, decision));
}

async function listMessages(req, res) {
  if (!validateParam(req, res, "requestId")) {
    return;
  }
  return res.status(200).json(await service.listMessages(req.auth.userId, req.params.requestId));
}

async function createMessage(req, res) {
  if (!validateParam(req, res, "requestId")) {
    return;
  }
  const validation = validateMessage(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res
    .status(201)
    .json(
      await service.createMessage(req.auth.userId, req.params.requestId, validation.value.message)
    );
}

module.exports = {
  cancelRequest: send(cancelRequest),
  createMessage: send(createMessage),
  createQuote: send(createQuote),
  createRequest: send(createRequest),
  decideQuote: (decision) => send((req, res) => decideQuote(req, res, decision)),
  discoverRequests: send(discoverRequests),
  getQuote: send(getQuote),
  getRequest: send(getRequest),
  listMessages: send(listMessages),
  listQuotes: send(listQuotes),
  listRequests: send(listRequests),
  patchQuote: send(patchQuote),
  patchRequest: send(patchRequest),
  submitQuote: send(submitQuote),
};
