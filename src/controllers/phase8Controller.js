const service = require("../services/phase8Service");
const {
  validateId,
  validateInvoiceCreate,
  validateInvoicePatch,
  validateInvoiceQuery,
  validatePaymentAction,
  validatePaymentCreate,
  validatePaymentQuery,
} = require("../validators/phase8");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function validateParam(req, res, name) {
  const error = validateId(req.params[name], name);
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

async function listInvoices(req, res) {
  const validation = validateInvoiceQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listInvoices(req.auth.userId, validation.value));
}

async function getInvoice(req, res) {
  if (!validateParam(req, res, "id")) {
    return;
  }
  return res.status(200).json(await service.getInvoice(req.auth.userId, req.params.id));
}

async function createInvoice(req, res) {
  const validation = validateInvoiceCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(await service.createInvoice(req.auth.userId, validation.value));
}

async function patchInvoice(req, res) {
  if (!validateParam(req, res, "id")) {
    return;
  }
  const validation = validateInvoicePatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.updateInvoice(req.auth.userId, req.params.id, validation.value)
  );
}

function invoiceAction(action) {
  return send(async (req, res) => {
    if (!validateParam(req, res, "id")) {
      return;
    }
    const validation = validatePaymentAction(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    return res.status(200).json(
      await service.transitionInvoice(req.auth.userId, req.params.id, action)
    );
  });
}

async function listPayments(req, res) {
  if (!validateParam(req, res, "id")) {
    return;
  }
  const validation = validatePaymentQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.listPayments(req.auth.userId, req.params.id, validation.value)
  );
}

async function createPayment(req, res) {
  if (!validateParam(req, res, "id")) {
    return;
  }
  const validation = validatePaymentCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(
    await service.createPayment(req.auth.userId, req.params.id, validation.value)
  );
}

async function getPayment(req, res) {
  if (!validateParam(req, res, "id")) {
    return;
  }
  return res.status(200).json(await service.getPayment(req.auth.userId, req.params.id));
}

function paymentAction(action) {
  return send(async (req, res) => {
    if (!validateParam(req, res, "id")) {
      return;
    }
    const validation = validatePaymentAction(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    return res.status(200).json(
      await service.transitionPayment(req.auth.userId, req.params.id, action)
    );
  });
}

module.exports = {
  cancelInvoice: invoiceAction("cancel"),
  confirmPayment: paymentAction("confirm"),
  createInvoice: send(createInvoice),
  createPayment: send(createPayment),
  failPayment: paymentAction("fail"),
  getInvoice: send(getInvoice),
  getPayment: send(getPayment),
  issueInvoice: invoiceAction("issue"),
  listInvoices: send(listInvoices),
  listPayments: send(listPayments),
  patchInvoice: send(patchInvoice),
  refundPayment: paymentAction("refund"),
};
