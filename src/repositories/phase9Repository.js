const { pool } = require("../config/database");
const {
  notifyOrganizationMembers,
  notifySupportStaff,
  notifyUser,
} = require("./notificationRepository");

const supportRoles = ["admin", "support"];

async function isActiveUser(client, userId) {
  const result = await client.query(
    "SELECT 1 FROM users WHERE id = $1 AND status = 'active'",
    [userId]
  );
  return result.rowCount === 1;
}

async function isActiveStaff(client, userId) {
  const result = await client.query(
    "SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND platform_role = ANY($2::text[])",
    [userId, supportRoles]
  );
  return result.rowCount === 1;
}

async function listNotifications(userId, filters, db = pool) {
  const values = [userId];
  const conditions = ["user_id = $1"];
  if (filters.unreadOnly === "true") {
    conditions.push("read_at IS NULL");
  } else if (filters.unreadOnly === "false") {
    conditions.push("read_at IS NOT NULL");
  }
  const where = conditions.join(" AND ");
  const count = await db.query(
    `SELECT count(*)::int AS total FROM notifications WHERE ${where}`,
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await db.query(
    `SELECT id, type, title, message, related_entity_type AS "relatedEntityType",
            related_entity_id AS "relatedEntityId", read_at AS "readAt",
            created_at AS "createdAt"
     FROM notifications WHERE ${where}
     ORDER BY created_at DESC, id
     LIMIT $2 OFFSET $3`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function getNotification(userId, notificationId, db = pool) {
  const result = await db.query(
    `SELECT id, type, title, message, related_entity_type AS "relatedEntityType",
            related_entity_id AS "relatedEntityId", read_at AS "readAt",
            created_at AS "createdAt"
     FROM notifications WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

async function markNotificationRead(userId, notificationId, db = pool) {
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, message, related_entity_type AS "relatedEntityType",
               related_entity_id AS "relatedEntityId", read_at AS "readAt",
               created_at AS "createdAt"`,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

async function markAllNotificationsRead(userId, db = pool) {
  const result = await db.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rowCount;
}

async function countUnreadNotifications(userId, db = pool) {
  const result = await db.query(
    "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return result.rows[0].count;
}

function ticketColumns() {
  return `st.id, st.ticket_number AS "ticketNumber",
          st.created_by_user_id AS "createdByUserId",
          creator.first_name AS "creatorFirstName", creator.last_name AS "creatorLastName",
          st.assigned_to_user_id AS "assignedToUserId",
          assignee.first_name AS "assigneeFirstName", assignee.last_name AS "assigneeLastName",
          st.subject, st.description, st.category, st.priority, st.status,
          st.resolved_at AS "resolvedAt", st.created_at AS "createdAt",
          st.updated_at AS "updatedAt"`;
}

function ticketJoins() {
  return `FROM support_tickets st
          JOIN users creator ON creator.id = st.created_by_user_id
          LEFT JOIN users assignee ON assignee.id = st.assigned_to_user_id`;
}

async function listTickets(userId, filters, staff) {
  const values = [];
  const conditions = [];
  if (!staff) {
    values.push(userId);
    conditions.push(`st.created_by_user_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`st.status = $${values.length}`);
  }
  if (filters.priority) {
    values.push(filters.priority);
    conditions.push(`st.priority = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM support_tickets st ${where}`,
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT ${ticketColumns()} ${ticketJoins()} ${where}
     ORDER BY st.updated_at DESC, st.id
     LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function getAccessibleTicket(client, userId, ticketId) {
  const staff = await isActiveStaff(client, userId);
  const result = await client.query(
    `SELECT ${ticketColumns()} ${ticketJoins()}
     WHERE st.id = $1 AND ($3::boolean OR st.created_by_user_id = $2)`,
    [ticketId, userId, staff]
  );
  return result.rows[0] || null;
}

async function getTicketById(ticketId) {
  const result = await pool.query(
    `SELECT ${ticketColumns()} ${ticketJoins()} WHERE st.id = $1`,
    [ticketId]
  );
  return result.rows[0] || null;
}

async function createTicket(client, userId, ticketNumber, input) {
  const result = await client.query(
    `INSERT INTO support_tickets
       (ticket_number, created_by_user_id, subject, description, category, priority)
     SELECT $2, u.id, $3, $4, $5, $6
     FROM users u WHERE u.id = $1 AND u.status = 'active'
     RETURNING id`,
    [userId, ticketNumber, input.subject, input.description, input.category, input.priority]
  );
  if (!result.rows[0]) {
    return null;
  }
  await notifySupportStaff(client, userId, {
    type: "support_ticket_created",
    title: "New support ticket",
    message: "A user created a support ticket.",
    relatedEntityType: "support_ticket",
    relatedEntityId: result.rows[0].id,
  });
  return result.rows[0].id;
}

async function patchTicket(client, userId, ticketId, input) {
  const staff = await isActiveStaff(client, userId);
  if (Object.hasOwn(input, "assignedToUserId") && !staff) {
    return { forbiddenAssignment: true };
  }
  const lock = await client.query(
    `SELECT id, status FROM support_tickets
     WHERE id = $1 AND ($3::boolean OR created_by_user_id = $2)
     FOR UPDATE`,
    [ticketId, userId, staff]
  );
  if (!lock.rows[0] || (!staff && lock.rows[0].status !== "open")) {
    return null;
  }
  if (Object.hasOwn(input, "assignedToUserId")) {
    if (input.assignedToUserId) {
      const assignee = await client.query(
        `SELECT 1 FROM users
         WHERE id = $1 AND status = 'active' AND platform_role = ANY($2::text[])`,
        [input.assignedToUserId, supportRoles]
      );
      if (!assignee.rowCount) {
        return { invalidAssignee: true };
      }
    }
  }
  const columns = {
    subject: "subject",
    description: "description",
    category: "category",
    priority: "priority",
    assignedToUserId: "assigned_to_user_id",
  };
  const values = [];
  const assignments = [];
  for (const [field, column] of Object.entries(columns)) {
    if (Object.hasOwn(input, field)) {
      values.push(input[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }
  assignments.push("updated_at = NOW()");
  values.push(ticketId);
  await client.query(
    `UPDATE support_tickets SET ${assignments.join(", ")} WHERE id = $${values.length}`,
    values
  );
  return { id: ticketId };
}

async function transitionTicket(client, userId, ticketId, action) {
  const staff = await isActiveStaff(client, userId);
  const ticket = await client.query(
    `SELECT id, status, created_by_user_id AS "createdByUserId",
            assigned_to_user_id AS "assignedToUserId"
     FROM support_tickets
     WHERE id = $1 AND ($3::boolean OR created_by_user_id = $2)
     FOR UPDATE`,
    [ticketId, userId, staff]
  );
  if (!ticket.rows[0]) {
    return { missing: true };
  }
  const row = ticket.rows[0];
  const transitions = {
    close: { from: ["open", "in_progress", "resolved"], to: "closed" },
    reopen: { from: ["closed"], to: "open" },
    resolve: { from: ["open", "in_progress"], to: "resolved" },
  };
  const transition = transitions[action];
  if (action === "resolve" && !staff) {
    return { forbidden: true };
  }
  if (!transition.from.includes(row.status)) {
    return { conflict: true, status: row.status };
  }
  await client.query(
    `UPDATE support_tickets
     SET status = $2::varchar,
         resolved_at = CASE
           WHEN $2::varchar = 'resolved' THEN NOW()
           WHEN $2::varchar = 'open' THEN NULL
           ELSE resolved_at
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [ticketId, transition.to]
  );
  return { id: ticketId, status: transition.to };
}

async function listTicketMessages(client, userId, ticketId, filters) {
  if (!(await getAccessibleTicket(client, userId, ticketId))) {
    return null;
  }
  const values = [ticketId];
  const count = await client.query(
    "SELECT count(*)::int AS total FROM ticket_messages WHERE ticket_id = $1",
    values
  );
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await client.query(
    `SELECT tm.id, tm.ticket_id AS "ticketId", tm.sender_user_id AS "senderUserId",
            u.first_name AS "senderFirstName", u.last_name AS "senderLastName",
            tm.message, tm.created_at AS "createdAt"
     FROM ticket_messages tm JOIN users u ON u.id = tm.sender_user_id
     WHERE tm.ticket_id = $1
     ORDER BY tm.created_at, tm.id
     LIMIT $2 OFFSET $3`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function createTicketMessage(client, userId, ticketId, message) {
  const staff = await isActiveStaff(client, userId);
  const ticketResult = await client.query(
    `SELECT id, status, created_by_user_id AS "createdByUserId",
            assigned_to_user_id AS "assignedToUserId"
     FROM support_tickets
     WHERE id = $1 AND ($3::boolean OR created_by_user_id = $2)
     FOR UPDATE`,
    [ticketId, userId, staff]
  );
  if (!ticketResult.rows[0]) {
    return { missing: true };
  }
  const ticket = ticketResult.rows[0];
  if (ticket.status === "closed") {
    return { closed: true };
  }
  const inserted = await client.query(
    `INSERT INTO ticket_messages (ticket_id, sender_user_id, message)
     SELECT $1, u.id, $3 FROM users u
     WHERE u.id = $2 AND u.status = 'active'
     RETURNING id, ticket_id AS "ticketId", sender_user_id AS "senderUserId",
               message, created_at AS "createdAt"`,
    [ticketId, userId, message]
  );
  await client.query(
    `UPDATE support_tickets
     SET status = CASE WHEN $2::boolean AND status = 'open' THEN 'in_progress' ELSE status END,
         updated_at = NOW()
     WHERE id = $1`,
    [ticketId, staff]
  );
  if (staff) {
    await notifyUser(client, ticket.createdByUserId, {
      type: "support_ticket_message",
      title: "Support replied",
      message: "A support team member replied to your ticket.",
      relatedEntityType: "support_ticket",
      relatedEntityId: ticketId,
    });
  } else if (ticket.assignedToUserId) {
    await notifyUser(client, ticket.assignedToUserId, {
      type: "support_ticket_message",
      title: "Ticket reply",
      message: "The ticket creator replied to an assigned ticket.",
      relatedEntityType: "support_ticket",
      relatedEntityId: ticketId,
    });
  } else {
    await notifySupportStaff(client, userId, {
      type: "support_ticket_message",
      title: "Ticket reply",
      message: "A user replied to a support ticket.",
      relatedEntityType: "support_ticket",
      relatedEntityId: ticketId,
    });
  }
  return { data: inserted.rows[0] };
}

function reviewColumns() {
  return `r.id, r.service_request_id AS "serviceRequestId",
          r.consumer_organization_id AS "consumerOrganizationId",
          co.name AS "consumerOrganizationName",
          r.provider_organization_id AS "providerOrganizationId",
          po.name AS "providerOrganizationName",
          r.rating, r.comment, r.created_at AS "createdAt"`;
}

async function listReviews(filters) {
  const values = [];
  const conditions = [
    "po.status = 'active'",
    "po.organization_type = 'provider'",
    "pp.status = 'approved'",
  ];
  if (filters.providerOrganizationId) {
    values.push(filters.providerOrganizationId);
    conditions.push(`r.provider_organization_id = $${values.length}`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const joins = `FROM reviews r
                 JOIN organizations co ON co.id = r.consumer_organization_id
                 JOIN organizations po ON po.id = r.provider_organization_id
                 JOIN provider_profiles pp ON pp.organization_id = po.id`;
  const count = await pool.query(`SELECT count(*)::int AS total ${joins} ${where}`, values);
  const paged = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const rows = await pool.query(
    `SELECT ${reviewColumns()} ${joins} ${where}
     ORDER BY r.created_at DESC, r.id
     LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
    paged
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function getReviewById(reviewId) {
  const result = await pool.query(
    `SELECT ${reviewColumns()}
     FROM reviews r
     JOIN organizations co ON co.id = r.consumer_organization_id
     JOIN organizations po ON po.id = r.provider_organization_id
     JOIN provider_profiles pp ON pp.organization_id = po.id
     WHERE r.id = $1 AND po.status = 'active' AND po.organization_type = 'provider'
       AND pp.status = 'approved'`,
    [reviewId]
  );
  return result.rows[0] || null;
}

async function createReview(client, userId, input) {
  const request = await client.query(
    `SELECT sr.id, sr.consumer_organization_id AS "consumerOrganizationId",
            sr.provider_organization_id AS "providerOrganizationId"
     FROM service_requests sr
     JOIN organizations co ON co.id = sr.consumer_organization_id
       AND co.organization_type = 'consumer' AND co.status = 'active'
     JOIN organization_memberships om ON om.organization_id = co.id
       AND om.user_id = $2 AND om.status = 'active'
       AND om.role = ANY($3::text[])
     JOIN users u ON u.id = om.user_id AND u.status = 'active'
     WHERE sr.id = $1 AND sr.status = 'completed'
       AND EXISTS (
         SELECT 1 FROM work_orders wo
         WHERE wo.service_request_id = sr.id
           AND wo.provider_organization_id = sr.provider_organization_id
           AND wo.status = 'completed'
       )
     FOR UPDATE OF sr`,
    [input.serviceRequestId, userId, ["owner", "admin", "manager"]]
  );
  if (!request.rows[0] || !request.rows[0].providerOrganizationId) {
    return { unavailable: true };
  }
  const inserted = await client.query(
    `INSERT INTO reviews
       (service_request_id, consumer_organization_id, provider_organization_id,
        reviewer_user_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (service_request_id) DO NOTHING
     RETURNING id`,
    [
      request.rows[0].id,
      request.rows[0].consumerOrganizationId,
      request.rows[0].providerOrganizationId,
      userId,
      input.rating,
      input.comment,
    ]
  );
  if (!inserted.rows[0]) {
    return { duplicate: true };
  }
  await notifyOrganizationMembers(client, request.rows[0].providerOrganizationId, userId, {
    type: "provider_review_received",
    title: "New provider review",
    message: "A consumer submitted a review for your organization.",
    relatedEntityType: "review",
    relatedEntityId: inserted.rows[0].id,
  });
  return { id: inserted.rows[0].id };
}

async function updateReview(client, userId, reviewId, input) {
  const lock = await client.query(
    "SELECT id FROM reviews WHERE id = $1 AND reviewer_user_id = $2 FOR UPDATE",
    [reviewId, userId]
  );
  if (!lock.rows[0]) {
    return false;
  }
  const result = await client.query(
    `UPDATE reviews SET rating = COALESCE($3::integer, rating),
                         comment = CASE WHEN $4::boolean THEN $5::text ELSE comment END
     WHERE id = $1 AND reviewer_user_id = $2
     RETURNING id`,
    [reviewId, userId, input.rating ?? null, Object.hasOwn(input, "comment"), input.comment]
  );
  return result.rowCount === 1;
}

async function canAccessRequest(client, userId, requestId) {
  const result = await client.query(
    `SELECT 1 FROM service_requests sr
     WHERE sr.id = $2 AND EXISTS (
       SELECT 1 FROM users u WHERE u.id = $1 AND u.status = 'active'
     ) AND (
       EXISTS (
         SELECT 1 FROM users u WHERE u.id = $1 AND u.status = 'active'
           AND u.platform_role IN ('admin', 'support')
       )
       OR EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.id = sr.consumer_organization_id
       )
       OR EXISTS (
         SELECT 1 FROM organization_memberships om
         JOIN organizations o ON o.id = om.organization_id AND o.status = 'active'
         JOIN users u ON u.id = om.user_id AND u.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'
           AND o.organization_type = 'provider'
           AND (o.id = sr.provider_organization_id OR EXISTS (
             SELECT 1 FROM quotes q WHERE q.service_request_id = sr.id
               AND q.provider_organization_id = o.id
           ))
       )
     )`,
    [userId, requestId]
  );
  return result.rowCount === 1;
}

async function canAccessTicket(client, userId, ticketId) {
  const result = await client.query(
    `SELECT 1 FROM support_tickets st
     JOIN users actor ON actor.id = $1 AND actor.status = 'active'
     WHERE st.id = $2 AND (
       st.created_by_user_id = actor.id
       OR actor.platform_role IN ('admin', 'support')
     )`,
    [userId, ticketId]
  );
  return result.rowCount === 1;
}

async function getAccessibleAttachment(client, userId, attachmentId) {
  const result = await client.query(
    `SELECT a.id, a.uploaded_by_user_id AS "uploadedByUserId",
            a.service_request_id AS "serviceRequestId", a.ticket_id AS "ticketId",
            a.storage_key AS "storageKey", a.file_name AS "fileName",
            a.mime_type AS "mimeType", a.size_bytes::text AS "sizeBytes",
            a.created_at AS "createdAt"
     FROM attachments a
     WHERE a.id = $1
       AND ((a.service_request_id IS NOT NULL) <> (a.ticket_id IS NOT NULL))
       AND (
       (a.service_request_id IS NOT NULL AND
         EXISTS (SELECT 1 FROM service_requests sr WHERE sr.id = a.service_request_id)
       ) OR
       (a.ticket_id IS NOT NULL AND
         EXISTS (SELECT 1 FROM support_tickets st WHERE st.id = a.ticket_id)
       )
     )`,
    [attachmentId]
  );
  const attachment = result.rows[0];
  if (!attachment) {
    return null;
  }
  const canAccess = attachment.serviceRequestId
    ? await canAccessRequest(client, userId, attachment.serviceRequestId)
    : await canAccessTicket(client, userId, attachment.ticketId);
  return canAccess ? attachment : null;
}

async function listAttachments(client, userId, filters) {
  const parentId = filters.serviceRequestId || filters.ticketId;
  const parentAccess = filters.serviceRequestId
    ? await canAccessRequest(client, userId, parentId)
    : await canAccessTicket(client, userId, parentId);
  if (!parentAccess) {
    return null;
  }
  const parentColumn = filters.serviceRequestId ? "service_request_id" : "ticket_id";
  const count = await client.query(
    `SELECT count(*)::int AS total FROM attachments WHERE ${parentColumn} = $1`,
    [parentId]
  );
  const rows = await client.query(
    `SELECT id, uploaded_by_user_id AS "uploadedByUserId",
            service_request_id AS "serviceRequestId", ticket_id AS "ticketId",
            storage_key AS "storageKey", file_name AS "fileName",
            mime_type AS "mimeType", size_bytes::text AS "sizeBytes",
            created_at AS "createdAt"
     FROM attachments WHERE ${parentColumn} = $1
     ORDER BY created_at DESC, id
     LIMIT $2 OFFSET $3`,
    [parentId, filters.limit, (filters.page - 1) * filters.limit]
  );
  return { data: rows.rows, total: count.rows[0].total };
}

async function createAttachment(client, userId, input) {
  const parentId = input.serviceRequestId || input.ticketId;
  const parentAccess = input.serviceRequestId
    ? await canAccessRequest(client, userId, parentId)
    : await canAccessTicket(client, userId, parentId);
  if (!parentAccess) {
    return null;
  }
  const result = await client.query(
    `INSERT INTO attachments
       (uploaded_by_user_id, service_request_id, ticket_id, storage_key,
        file_name, mime_type, size_bytes)
     SELECT u.id, $2, $3, $4, $5, $6, $7::bigint
     FROM users u WHERE u.id = $1 AND u.status = 'active'
     RETURNING id`,
    [
      userId,
      input.serviceRequestId || null,
      input.ticketId || null,
      input.storageKey,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
    ]
  );
  return result.rows[0]?.id || null;
}

async function deleteAttachment(client, userId, attachmentId) {
  const attachment = await getAccessibleAttachment(client, userId, attachmentId);
  if (!attachment) {
    return false;
  }
  const staff = await isActiveStaff(client, userId);
  if (!staff && attachment.uploadedByUserId !== userId) {
    return false;
  }
  const result = await client.query(
    "DELETE FROM attachments WHERE id = $1 AND (uploaded_by_user_id = $2 OR $3::boolean)",
    [attachmentId, userId, staff]
  );
  return result.rowCount === 1;
}

module.exports = {
  canAccessRequest,
  canAccessTicket,
  countUnreadNotifications,
  createAttachment,
  createReview,
  createTicket,
  createTicketMessage,
  deleteAttachment,
  getAccessibleAttachment,
  getAccessibleTicket,
  getNotification,
  getReviewById,
  getTicketById,
  isActiveStaff,
  isActiveUser,
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
