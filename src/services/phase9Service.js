const crypto = require("crypto");
const { pool } = require("../config/database");
const httpError = require("../utils/httpError");
const repository = require("../repositories/phase9Repository");

async function withTransaction(work) {
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN");
    open = true;
    const result = await work(client);
    await client.query("COMMIT");
    open = false;
    return result;
  } catch (error) {
    if (open) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Failed to roll back a Phase 9 transaction.");
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function paginated(result, page, limit) {
  return {
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  };
}

async function requireActiveUser(userId) {
  if (!(await repository.isActiveUser(pool, userId))) {
    throw httpError(401, "The authenticated account is no longer active.");
  }
}

async function listNotifications(userId, filters) {
  await requireActiveUser(userId);
  return paginated(
    await repository.listNotifications(userId, filters),
    filters.page,
    filters.limit
  );
}

async function getNotification(userId, notificationId) {
  await requireActiveUser(userId);
  const notification = await repository.getNotification(userId, notificationId);
  if (!notification) {
    throw httpError(404, "Notification was not found.");
  }
  return { data: notification };
}

async function markNotificationRead(userId, notificationId) {
  await requireActiveUser(userId);
  const notification = await repository.markNotificationRead(userId, notificationId);
  if (!notification) {
    throw httpError(404, "Notification was not found.");
  }
  return { data: notification };
}

async function markAllNotificationsRead(userId) {
  await requireActiveUser(userId);
  return { data: { updated: await repository.markAllNotificationsRead(userId) } };
}

async function countUnreadNotifications(userId) {
  await requireActiveUser(userId);
  return { data: { count: await repository.countUnreadNotifications(userId) } };
}

async function listTickets(userId, filters) {
  const staff = await repository.isActiveStaff(pool, userId);
  if (!(await repository.isActiveUser(pool, userId))) {
    throw httpError(401, "The authenticated account is no longer active.");
  }
  return paginated(
    await repository.listTickets(userId, filters, staff),
    filters.page,
    filters.limit
  );
}

async function getTicket(userId, ticketId) {
  await requireActiveUser(userId);
  const ticket = await repository.getAccessibleTicket(pool, userId, ticketId);
  if (!ticket) {
    throw httpError(404, "Support ticket was not found.");
  }
  return { data: ticket };
}

async function createTicket(userId, input) {
  await requireActiveUser(userId);
  const ticketNumber =
    `ST-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const id = await withTransaction((client) =>
    repository.createTicket(client, userId, ticketNumber, input)
  );
  if (!id) {
    throw httpError(401, "The authenticated account is no longer active.");
  }
  return { data: await repository.getTicketById(id) };
}

async function patchTicket(userId, ticketId, input) {
  if (!(await repository.isActiveUser(pool, userId))) {
    throw httpError(401, "The authenticated account is no longer active.");
  }
  const result = await withTransaction((client) =>
    repository.patchTicket(client, userId, ticketId, input)
  );
  if (!result) {
    throw httpError(404, "Support ticket was not found or is no longer editable.");
  }
  if (result.invalidAssignee) {
    throw httpError(400, "assignedToUserId must identify an active support or admin account.");
  }
  if (result.forbiddenAssignment) {
    throw httpError(403, "Only support staff can change ticket assignments.");
  }
  return { data: await repository.getTicketById(ticketId) };
}

async function transitionTicket(userId, ticketId, action) {
  await requireActiveUser(userId);
  const result = await withTransaction((client) =>
    repository.transitionTicket(client, userId, ticketId, action)
  );
  if (result.missing) {
    throw httpError(404, "Support ticket was not found.");
  }
  if (result.forbidden) {
    throw httpError(403, "Only support staff can resolve a ticket.");
  }
  if (result.conflict) {
    throw httpError(409, `A ticket with status '${result.status}' cannot be ${action}d.`);
  }
  return { data: await repository.getTicketById(ticketId) };
}

async function listTicketMessages(userId, ticketId, filters) {
  await requireActiveUser(userId);
  const result = await repository.listTicketMessages(pool, userId, ticketId, filters);
  if (!result) {
    throw httpError(404, "Support ticket was not found.");
  }
  return paginated(result, filters.page, filters.limit);
}

async function createTicketMessage(userId, ticketId, message) {
  await requireActiveUser(userId);
  const result = await withTransaction((client) =>
    repository.createTicketMessage(client, userId, ticketId, message)
  );
  if (result.missing) {
    throw httpError(404, "Support ticket was not found.");
  }
  if (result.closed) {
    throw httpError(409, "Closed tickets cannot receive new messages; reopen the ticket first.");
  }
  return { data: result.data };
}

async function listReviews(userId, filters) {
  await requireActiveUser(userId);
  return paginated(await repository.listReviews(filters), filters.page, filters.limit);
}

async function getReview(userId, reviewId) {
  await requireActiveUser(userId);
  const review = await repository.getReviewById(reviewId);
  if (!review) {
    throw httpError(404, "Review was not found.");
  }
  return { data: review };
}

async function createReview(userId, input) {
  const result = await withTransaction((client) =>
    repository.createReview(client, userId, input)
  );
  if (result.unavailable) {
    throw httpError(409, "A completed service request and matching completed work order in your consumer organization are required.");
  }
  if (result.duplicate) {
    throw httpError(409, "This service request has already been reviewed.");
  }
  return { data: await repository.getReviewById(result.id) };
}

async function updateReview(userId, reviewId, input) {
  await requireActiveUser(userId);
  const updated = await withTransaction((client) =>
    repository.updateReview(client, userId, reviewId, input)
  );
  if (!updated) {
    throw httpError(404, "Review was not found or is not editable by this account.");
  }
  return { data: await repository.getReviewById(reviewId) };
}

async function listAttachments(userId, filters) {
  await requireActiveUser(userId);
  const result = await repository.listAttachments(pool, userId, filters);
  if (!result) {
    throw httpError(404, "Attachment parent was not found or is not available to this account.");
  }
  return paginated(result, filters.page, filters.limit);
}

async function getAttachment(userId, attachmentId) {
  await requireActiveUser(userId);
  const attachment = await repository.getAccessibleAttachment(pool, userId, attachmentId);
  if (!attachment) {
    throw httpError(404, "Attachment was not found.");
  }
  return { data: attachment };
}

async function createAttachment(userId, input) {
  await requireActiveUser(userId);
  const id = await withTransaction((client) =>
    repository.createAttachment(client, userId, input)
  );
  if (!id) {
    throw httpError(404, "Attachment parent was not found or is not available to this account.");
  }
  return { data: await repository.getAccessibleAttachment(pool, userId, id) };
}

async function deleteAttachment(userId, attachmentId) {
  await requireActiveUser(userId);
  const deleted = await withTransaction((client) =>
    repository.deleteAttachment(client, userId, attachmentId)
  );
  if (!deleted) {
    throw httpError(404, "Attachment was not found or is not available to this account.");
  }
  return { data: { id: attachmentId, deleted: true } };
}

module.exports = {
  countUnreadNotifications,
  createAttachment,
  createReview,
  createTicket,
  createTicketMessage,
  deleteAttachment,
  getAttachment,
  getNotification,
  getReview,
  getTicket,
  listAttachments,
  listNotifications,
  listReviews,
  listTicketMessages,
  listTickets,
  markAllNotificationsRead,
  markNotificationRead,
  patchTicket,
  transitionTicket,
  updateReview,
};
