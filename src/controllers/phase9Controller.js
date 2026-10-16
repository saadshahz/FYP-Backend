const service = require("../services/phase9Service");
const validators = require("../validators/phase9");

function send(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function validateParam(req, res, field = "id") {
  const error = validators.validateId(req.params[field], field);
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

async function listNotifications(req, res) {
  const validation = validators.validateNotificationQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.listNotifications(req.auth.userId, validation.value)
  );
}

async function getNotification(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(
    await service.getNotification(req.auth.userId, req.params.id)
  );
}

async function readNotification(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  if (req.body && Object.keys(req.body).length) {
    return res.status(400).json({ error: "This action does not accept a request body." });
  }
  return res.status(200).json(
    await service.markNotificationRead(req.auth.userId, req.params.id)
  );
}

async function readAllNotifications(req, res) {
  if (req.body && Object.keys(req.body).length) {
    return res.status(400).json({ error: "This action does not accept a request body." });
  }
  return res.status(200).json(await service.markAllNotificationsRead(req.auth.userId));
}

async function unreadCount(req, res) {
  return res.status(200).json(await service.countUnreadNotifications(req.auth.userId));
}

async function listTickets(req, res) {
  const validation = validators.validateTicketQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listTickets(req.auth.userId, validation.value));
}

async function createTicket(req, res) {
  const validation = validators.validateTicketCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(await service.createTicket(req.auth.userId, validation.value));
}

async function getTicket(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(await service.getTicket(req.auth.userId, req.params.id));
}

async function patchTicket(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  const validation = validators.validateTicketPatch(req.body, true);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.patchTicket(req.auth.userId, req.params.id, validation.value)
  );
}

function ticketAction(action) {
  return send(async (req, res) => {
    if (!validateParam(req, res)) {
      return;
    }
    if (req.body && Object.keys(req.body).length) {
      return res.status(400).json({ error: "This action does not accept a request body." });
    }
    return res.status(200).json(
      await service.transitionTicket(req.auth.userId, req.params.id, action)
    );
  });
}

async function listTicketMessages(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  const validation = validators.validatePageQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.listTicketMessages(req.auth.userId, req.params.id, validation.value)
  );
}

async function createTicketMessage(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  const validation = validators.validateTicketMessage(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(
    await service.createTicketMessage(req.auth.userId, req.params.id, validation.value.message)
  );
}

async function listReviews(req, res) {
  const validation = validators.validateReviewQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(await service.listReviews(req.auth.userId, validation.value));
}

async function createReview(req, res) {
  const validation = validators.validateReviewCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(await service.createReview(req.auth.userId, validation.value));
}

async function getReview(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(await service.getReview(req.auth.userId, req.params.id));
}

async function patchReview(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  const validation = validators.validateReviewPatch(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.updateReview(req.auth.userId, req.params.id, validation.value)
  );
}

async function listAttachments(req, res) {
  const validation = validators.validateAttachmentQuery(req.query);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(200).json(
    await service.listAttachments(req.auth.userId, validation.value)
  );
}

async function createAttachment(req, res) {
  const validation = validators.validateAttachmentCreate(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  return res.status(201).json(
    await service.createAttachment(req.auth.userId, validation.value)
  );
}

async function getAttachment(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(await service.getAttachment(req.auth.userId, req.params.id));
}

async function deleteAttachment(req, res) {
  if (!validateParam(req, res)) {
    return;
  }
  return res.status(200).json(
    await service.deleteAttachment(req.auth.userId, req.params.id)
  );
}

module.exports = {
  createAttachment: send(createAttachment),
  createReview: send(createReview),
  createTicket: send(createTicket),
  createTicketMessage: send(createTicketMessage),
  deleteAttachment: send(deleteAttachment),
  getAttachment: send(getAttachment),
  getNotification: send(getNotification),
  getReview: send(getReview),
  getTicket: send(getTicket),
  listAttachments: send(listAttachments),
  listNotifications: send(listNotifications),
  listReviews: send(listReviews),
  listTicketMessages: send(listTicketMessages),
  listTickets: send(listTickets),
  markAllNotificationsRead: send(readAllNotifications),
  markNotificationRead: send(readNotification),
  patchReview: send(patchReview),
  patchTicket: send(patchTicket),
  resolveTicket: ticketAction("resolve"),
  closeTicket: ticketAction("close"),
  reopenTicket: ticketAction("reopen"),
  unreadCount: send(unreadCount),
};
