const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: "string", format: "uuid" };
const nullable = (schema) => ({ ...schema, nullable: true });
const string = (maxLength, description) => ({
  type: "string",
  ...(maxLength ? { maxLength } : {}),
  ...(description ? { description } : {}),
});
const jsonObject = {
  type: "object",
  additionalProperties: true,
  description: "The endpoint's JSON response object.",
};
const objectSchema = (properties, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const schemas = {
  Error: objectSchema({ error: { type: "string" } }, ["error"]),
  Health: objectSchema({
    status: { type: "string", enum: ["ok", "error"] },
    database: { type: "string", enum: ["ok", "unavailable"] },
  }, ["status", "database"]),
  Pagination: objectSchema({
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    total: { type: "integer", minimum: 0 },
    totalPages: { type: "integer", minimum: 0 },
  }, ["page", "limit", "total", "totalPages"]),
  DataEnvelope: objectSchema({ data: jsonObject }, ["data"]),
  ListEnvelope: objectSchema({
    data: { type: "array", items: jsonObject },
    pagination: ref("Pagination"),
  }, ["data", "pagination"]),
  HealthResponse: ref("Health"),
  User: objectSchema({
    id: uuid, first_name: string(100), last_name: nullable(string(100)),
    email: { type: "string", format: "email" }, phone: nullable(string(30)),
    avatar_url: nullable({ type: "string", format: "uri" }),
    platform_role: { type: "string", enum: ["user", "admin", "support"] },
    status: { type: "string", enum: ["active", "inactive", "suspended", "pending"] },
    email_verified_at: nullable({ type: "string", format: "date-time" }),
    created_at: { type: "string", format: "date-time" },
    memberships: { type: "array", items: ref("Membership") },
  }, ["id", "email", "platform_role", "status"]),
  Membership: objectSchema({
    id: uuid, organizationId: uuid, organizationName: string(200),
    organizationType: { type: "string", enum: ["consumer", "provider"] },
    organizationStatus: { type: "string", enum: ["active", "inactive", "pending", "suspended"] },
    role: { type: "string", enum: ["owner", "admin", "manager", "member", "technician", "billing"] },
    status: { type: "string", enum: ["active", "inactive", "invited"] },
  }, ["id", "organizationId", "organizationName", "organizationType", "role", "status"]),
  Organization: objectSchema({
    id: uuid, name: string(200), organizationType: { type: "string", enum: ["consumer", "provider"] },
    industryId: nullable(uuid), industryName: nullable(string(150)), email: nullable({ type: "string", format: "email" }),
    phone: nullable(string(30)), address: nullable(string(5000)), city: nullable(string(100)),
    state: nullable(string(100)), country: nullable(string(100)), postalCode: nullable(string(20)),
    status: { type: "string", enum: ["active", "inactive", "pending", "suspended"] },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    membershipRole: { type: "string", enum: ["owner", "admin", "manager", "member", "technician", "billing"] },
  }, ["id", "name", "organizationType", "status", "membershipRole"]),
  ProviderProfile: objectSchema({
    id: uuid, organizationId: uuid, description: nullable(string(5000)),
    websiteUrl: nullable({ type: "string", format: "uri" }),
    serviceArea: nullable(string(500)), emergencyAvailable: { type: "boolean" },
    responseTimeHours: nullable({ type: "integer", minimum: 0 }),
    status: { type: "string", enum: ["pending", "approved", "rejected"] },
    verifiedAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "organizationId", "status"]),
  ProviderService: objectSchema({
    id: uuid, organizationId: uuid, serviceCategoryId: nullable(uuid),
    serviceCategoryName: nullable(string(150)),
    name: string(200), description: nullable(string(5000)),
    basePrice: nullable({ oneOf: [{ type: "string" }, { type: "number" }] }),
    currency: { type: "string", pattern: "^[A-Z]{3}$" }, isActive: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "organizationId", "name", "currency", "isActive"]),
  Asset: objectSchema({
    id: uuid, organizationId: uuid, name: string(200), category: nullable(string(150)),
    manufacturer: nullable(string(150)), model: nullable(string(150)),
    serialNumber: nullable(string(150)), location: nullable(string(5000)),
    installDate: nullable({ type: "string", format: "date" }),
    warrantyExpiry: nullable({ type: "string", format: "date" }),
    lastMaintenanceAt: nullable({ type: "string", format: "date-time" }),
    nextMaintenanceAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["active", "inactive", "under_maintenance", "retired"] },
  }, ["id", "organizationId", "name", "status"]),
  MaintenancePlan: objectSchema({
    id: uuid, assetId: uuid, providerOrganizationId: uuid,
    providerOrganizationName: string(200), assetStatus: { type: "string", enum: ["active", "inactive", "under_maintenance", "retired"] },
    frequency: { type: "string", enum: ["weekly", "monthly", "quarterly", "semiannually", "annually"] },
    nextDueAt: nullable({ type: "string", format: "date-time" }), isActive: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "assetId", "providerOrganizationId", "providerOrganizationName", "frequency", "isActive"]),
  ServiceRequest: objectSchema({
    id: uuid, requestNumber: string(50), consumerOrganizationId: uuid,
    consumerOrganizationName: string(200), requestedByUserId: uuid,
    providerOrganizationId: nullable(uuid), providerOrganizationName: nullable(string(200)),
    assetId: nullable(uuid), assetName: nullable(string(200)), assetCategory: nullable(string(150)),
    serviceCategoryId: nullable(uuid), serviceCategoryName: nullable(string(150)),
    description: string(10000), priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    status: { type: "string", enum: ["draft", "submitted", "assigned", "quoted", "accepted", "in_progress", "completed", "cancelled", "rejected"] },
    serviceType: nullable(string(150)), preferredAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "requestNumber", "consumerOrganizationId", "description", "priority", "status"]),
  QuoteItem: objectSchema({
    id: uuid, description: string(255), quantity: { type: "string" },
    unitPrice: { type: "string" }, lineTotal: { type: "string" },
  }, ["description", "quantity", "unitPrice"]),
  Quote: objectSchema({
    id: uuid, serviceRequestId: uuid, providerOrganizationId: uuid,
    consumerOrganizationId: uuid, providerOrganizationName: string(200), submittedByUserId: uuid,
    status: { type: "string", enum: ["draft", "submitted", "accepted", "rejected", "expired", "cancelled"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" }, subtotal: { type: "string" },
    taxAmount: { type: "string" }, totalAmount: { type: "string" },
    estimatedDays: nullable({ type: "integer", minimum: 1, maximum: 3650 }),
    validUntil: nullable({ type: "string", format: "date" }), notes: nullable(string(10000)),
    items: { type: "array", items: ref("QuoteItem") },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "serviceRequestId", "providerOrganizationId", "status", "currency", "items"]),
  Contract: objectSchema({
    id: uuid, contractNumber: string(50), serviceRequestId: uuid, quoteId: uuid,
    consumerOrganizationId: uuid, providerOrganizationId: uuid,
    consumerOrganizationName: string(200), providerOrganizationName: string(200),
    status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired", "active", "completed", "cancelled"] },
    currency: { type: "string" }, totalAmount: { type: "string" },
    terms: nullable(string(20000)), startDate: nullable({ type: "string", format: "date" }),
    endDate: nullable({ type: "string", format: "date" }),
    sentAt: nullable({ type: "string", format: "date-time" }),
    acceptedAt: nullable({ type: "string", format: "date-time" }),
    requestNumber: nullable(string(50)), assetId: nullable(uuid), assetName: nullable(string(200)),
    quoteStatus: nullable({ type: "string" }), estimatedDays: nullable({ type: "integer" }),
    quoteValidUntil: nullable({ type: "string", format: "date" }),
    quoteItems: { type: "array", items: ref("QuoteItem") },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "contractNumber", "status"]),
  WorkOrder: objectSchema({
    id: uuid, workOrderNumber: string(50), serviceRequestId: uuid,
    requestNumber: string(50), consumerOrganizationId: uuid, consumerOrganizationName: string(200),
    providerOrganizationId: uuid, providerOrganizationName: string(200), assetId: nullable(uuid),
    assetName: nullable(string(200)),
    assignedToUserId: nullable(uuid),
    technicianFirstName: nullable(string(100)), technicianLastName: nullable(string(100)),
    status: { type: "string", enum: ["pending", "scheduled", "in_progress", "completed", "cancelled"] },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    scheduledStartAt: nullable({ type: "string", format: "date-time" }),
    scheduledEndAt: nullable({ type: "string", format: "date-time" }),
    estimatedCost: nullable({ type: "string" }), actualCost: nullable({ type: "string" }),
    notes: nullable(string(10000)),
    completedAt: nullable({ type: "string", format: "date-time" }),
    contractId: nullable(uuid), contractNumber: nullable(string(50)), contractStatus: nullable({ type: "string" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "workOrderNumber", "serviceRequestId", "providerOrganizationId", "status", "priority"]),
  WorkOrderEvent: objectSchema({
    id: uuid, workOrderId: uuid, actorUserId: nullable(uuid),
    oldStatus: nullable({ type: "string" }), newStatus: { type: "string" },
    note: nullable(string(1000)), createdAt: { type: "string", format: "date-time" },
  }, ["id", "workOrderId", "newStatus", "createdAt"]),
  InvoiceItem: objectSchema({
    id: uuid, description: string(255), quantity: { type: "string" },
    unitPrice: { type: "string" }, lineTotal: { type: "string" },
  }, ["description", "quantity", "unitPrice", "lineTotal"]),
  Invoice: objectSchema({
    id: uuid, invoiceNumber: string(50), workOrderId: nullable(uuid),
    serviceRequestId: nullable(uuid), workOrderNumber: nullable(string(50)),
    contractId: nullable(uuid), contractNumber: nullable(string(50)),
    consumerOrganizationId: uuid, consumerOrganizationName: string(200),
    providerOrganizationId: uuid, providerOrganizationName: string(200),
    status: { type: "string", enum: ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" }, subtotal: { type: "string" },
    taxRate: { type: "string" }, taxAmount: { type: "string" }, totalAmount: { type: "string" },
    amountPaid: { type: "string" }, amountDue: { type: "string" },
    dueAt: nullable({ type: "string", format: "date-time" }),
    issuedAt: nullable({ type: "string", format: "date-time" }), paidAt: nullable({ type: "string", format: "date-time" }),
    notes: nullable(string(10000)), createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    items: { type: "array", items: ref("InvoiceItem") },
  }, ["id", "invoiceNumber", "consumerOrganizationId", "providerOrganizationId", "status", "currency", "totalAmount"]),
  Payment: objectSchema({
    id: uuid, invoiceId: uuid, amount: { type: "string" },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    method: nullable(string(30)), reference: nullable(string(150)),
    status: { type: "string", enum: ["pending", "completed", "failed", "refunded"] },
    paidAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    invoiceNumber: string(50), consumerOrganizationId: uuid, providerOrganizationId: uuid,
  }, ["id", "invoiceId", "amount", "currency", "status"]),
  Notification: objectSchema({
    id: uuid, type: string(50), title: string(255), message: { type: "string" },
    relatedEntityType: nullable(string(50)), relatedEntityId: nullable(uuid),
    readAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" },
  }, ["id", "type", "title", "message", "createdAt"]),
  SupportTicket: objectSchema({
    id: uuid, ticketNumber: string(50), createdByUserId: uuid,
    assignedToUserId: nullable(uuid), subject: string(255), description: { type: "string" },
    creatorFirstName: string(100), creatorLastName: nullable(string(100)),
    assigneeFirstName: nullable(string(100)), assigneeLastName: nullable(string(100)),
    category: nullable(string(100)), priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
    resolvedAt: nullable({ type: "string", format: "date-time" }),
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
  }, ["id", "ticketNumber", "createdByUserId", "subject", "description", "priority", "status"]),
  TicketMessage: objectSchema({
    id: uuid, ticketId: uuid, senderUserId: uuid, message: { type: "string" },
    senderFirstName: string(100), senderLastName: nullable(string(100)),
    createdAt: { type: "string", format: "date-time" },
  }, ["id", "ticketId", "senderUserId", "message", "createdAt"]),
  Review: objectSchema({
    id: uuid, serviceRequestId: uuid, consumerOrganizationId: uuid,
    consumerOrganizationName: string(200), providerOrganizationId: uuid,
    providerOrganizationName: string(200),
    rating: { type: "integer", minimum: 1, maximum: 5 },
    comment: nullable(string(5000)), createdAt: { type: "string", format: "date-time" },
  }, ["id", "serviceRequestId", "providerOrganizationId", "rating"]),
  Attachment: objectSchema({
    id: uuid, serviceRequestId: nullable(uuid), ticketId: nullable(uuid),
    storageKey: string(2048), fileName: string(255), mimeType: nullable(string(100)),
    sizeBytes: nullable({ type: "string", pattern: "^(0|[1-9][0-9]*)$" }),
    uploadedByUserId: uuid, createdAt: { type: "string", format: "date-time" },
  }, ["id", "storageKey", "fileName", "uploadedByUserId"]),
  RegisterRequest: objectSchema({
    firstName: string(100), lastName: nullable(string(100)),
    email: { type: "string", format: "email", maxLength: 255 },
    password: { type: "string", minLength: 8, maxLength: 72, description: "Maximum 72 UTF-8 bytes." },
    organizationName: string(200),
    organizationType: { type: "string", enum: ["consumer", "provider"] },
    phone: nullable(string(30)),
  }, ["firstName", "email", "password", "organizationName", "organizationType"]),
  LoginRequest: objectSchema({
    email: { type: "string", format: "email" }, password: { type: "string", minLength: 1 },
  }, ["email", "password"]),
  OrganizationPatch: objectSchema({
    name: string(200), industryId: nullable(uuid), email: { type: "string", format: "email", maxLength: 255 },
    phone: string(30), address: string(5000), city: string(100),
    state: string(100), country: string(100), postalCode: string(20),
  }),
  ProviderProfilePatch: objectSchema({
    description: nullable(string(5000)), websiteUrl: nullable({ type: "string", format: "uri", maxLength: 2048 }),
    serviceArea: nullable(string(500)), emergencyAvailable: { type: "boolean" },
    responseTimeHours: nullable({ type: "integer", minimum: 0 }),
  }),
  ProviderServiceInput: objectSchema({
    serviceCategoryId: nullable(uuid), name: string(200),
    description: nullable(string(5000)), basePrice: nullable({ type: "number", minimum: 0, maximum: 9999999999.99 }),
    currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
  }),
  AssetInput: objectSchema({
    name: string(200), category: nullable(string(150)), manufacturer: nullable(string(150)),
    model: nullable(string(150)), serialNumber: nullable(string(150)), location: nullable(string(5000)),
    installDate: nullable({ type: "string", format: "date" }),
    warrantyExpiry: nullable({ type: "string", format: "date" }),
  }),
  MaintenancePlanInput: objectSchema({
    providerOrganizationId: uuid,
    frequency: { type: "string", enum: ["weekly", "monthly", "quarterly", "semiannually", "annually"] },
    nextDueAt: nullable({ type: "string", format: "date-time" }), isActive: { type: "boolean" },
  }),
  ServiceRequestInput: objectSchema({
    assetId: nullable(uuid), providerOrganizationId: nullable(uuid),
    serviceCategoryId: nullable(uuid), serviceType: nullable(string(150)),
    description: string(10000), priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    preferredAt: nullable({ type: "string", format: "date-time" }),
  }),
  QuoteLineInput: objectSchema({
    description: { type: "string", minLength: 1, maxLength: 255 },
    quantity: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
    unitPrice: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
  }, ["description", "quantity", "unitPrice"]),
  QuoteInput: objectSchema({
    currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
    taxAmount: { oneOf: [
      { type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
      { type: "number", minimum: 0, maximum: 9999999999.99 },
    ] },
    estimatedDays: nullable({ type: "integer", minimum: 1, maximum: 3650 }),
    validUntil: nullable({ type: "string", format: "date" }), notes: nullable(string(10000)),
    items: { type: "array", minItems: 1, maxItems: 50, items: ref("QuoteLineInput") },
  }),
  MessageInput: objectSchema({ message: { type: "string", minLength: 1, maxLength: 5000 } }, ["message"]),
  ContractInput: objectSchema({
    quoteId: uuid, terms: nullable(string(20000)),
    startDate: nullable({ type: "string", format: "date" }),
    endDate: nullable({ type: "string", format: "date" }),
  }, ["quoteId"]),
  ContractPatch: objectSchema({
    terms: nullable(string(20000)), startDate: nullable({ type: "string", format: "date" }),
    endDate: nullable({ type: "string", format: "date" }),
  }),
  WorkOrderInput: objectSchema({
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    scheduledStartAt: nullable({ type: "string", format: "date-time" }),
    scheduledEndAt: nullable({ type: "string", format: "date-time" }),
    estimatedCost: nullable({ type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" }),
    notes: nullable(string(10000)),
  }),
  AssignmentInput: objectSchema({
    technicianId: uuid, scheduledStartAt: { type: "string", format: "date-time" },
    scheduledEndAt: { type: "string", format: "date-time" }, note: nullable(string(1000)),
  }, ["technicianId"]),
  CompletionInput: objectSchema({
    actualCost: nullable({ type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" }),
    note: nullable(string(1000)),
  }),
  InvoiceLineInput: objectSchema({
    description: { type: "string", minLength: 1, maxLength: 255 },
    quantity: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
    unitPrice: { type: "string", pattern: "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
  }, ["description", "quantity", "unitPrice"]),
  InvoiceInput: objectSchema({
    workOrderId: uuid, taxRate: { oneOf: [
      { type: "string", pattern: "^(?:0|[1-9][0-9]{0,2})(?:\\.[0-9]{1,2})?$" },
      { type: "number", minimum: 0, maximum: 999.99 },
    ] },
    dueAt: nullable({ type: "string", format: "date-time" }), notes: nullable(string(10000)),
    items: { type: "array", minItems: 1, maxItems: 50, items: ref("InvoiceLineInput") },
  }, ["workOrderId", "items"]),
  InvoicePatch: objectSchema({
    taxRate: { oneOf: [
      { type: "string", pattern: "^(?:0|[1-9][0-9]{0,2})(?:\\.[0-9]{1,2})?$" },
      { type: "number", minimum: 0, maximum: 999.99 },
    ] },
    dueAt: nullable({ type: "string", format: "date-time" }), notes: nullable(string(10000)),
    items: { type: "array", minItems: 1, maxItems: 50, items: ref("InvoiceLineInput") },
  }),
  PaymentInput: objectSchema({
    amount: { oneOf: [
      { type: "string", pattern: "^(?:0*[1-9][0-9]{0,9}|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$" },
      { type: "number", exclusiveMinimum: true, minimum: 0, maximum: 9999999999.99 },
    ] },
    currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
    method: nullable({ type: "string", minLength: 1, maxLength: 30 }),
    reference: nullable(string(150)),
  }, ["amount"]),
  TicketInput: objectSchema({
    subject: { type: "string", minLength: 1, maxLength: 255 },
    description: { type: "string", minLength: 1, maxLength: 10000 },
    category: nullable(string(100)), priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
  }, ["subject", "description"]),
  TicketPatch: objectSchema({
    subject: { type: "string", minLength: 1, maxLength: 255 },
    description: { type: "string", minLength: 1, maxLength: 10000 },
    category: nullable(string(100)),
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    assignedToUserId: nullable(uuid),
  }),
  ReviewInput: objectSchema({
    serviceRequestId: uuid, rating: { type: "integer", minimum: 1, maximum: 5 },
    comment: nullable(string(5000)),
  }, ["serviceRequestId", "rating"]),
  ReviewPatch: objectSchema({
    rating: { type: "integer", minimum: 1, maximum: 5 }, comment: nullable(string(5000)),
  }),
  AttachmentInput: objectSchema({
    serviceRequestId: uuid, ticketId: uuid, storageKey: { type: "string", minLength: 1, maxLength: 2048 },
    fileName: { type: "string", minLength: 1, maxLength: 255 },
    mimeType: nullable(string(100)),
    sizeBytes: {
      anyOf: [
        { type: "integer", format: "int64", minimum: 0, nullable: true },
        { type: "string", pattern: "^(0|[1-9][0-9]{0,18})$", nullable: true },
      ],
    },
  }, ["storageKey", "fileName"]),
  EmptyAction: objectSchema({}),
};

const query = (name, description, schema, required = false) => ({
  name, in: "query", required, description, schema,
});
const uuidParam = (name, description) => ({
  name, in: "path", required: true, description, schema: uuid,
});
const pageQueries = [
  query("page", "1-based page number; defaults to 1.", { type: "integer", minimum: 1, default: 1 }),
  query("limit", "Page size; defaults to 20 and is capped at 100.", { type: "integer", minimum: 1, maximum: 100, default: 20 }),
];
const orgQuery = query("organizationId", "Organization membership to use. Required when selection is ambiguous.", uuid);
const statusQuery = (values) => query("status", `Filter by status: ${values.join(", ")}.`, { type: "string", enum: values });
const priorityQuery = query("priority", "Filter by priority.", { type: "string", enum: ["low", "normal", "high", "urgent"] });
const body = (schema, example, required = true) => ({
  required,
  content: { "application/json": { schema: ref(schema), ...(example ? { example } : {}) } },
});
const response = (description, schema, example) => ({
  description,
  ...(schema ? {
    content: {
      "application/json": {
        schema: ref(schema),
        ...(example ? { example } : {}),
      },
    },
  } : {}),
});
const permissions = {
  auth: "Requires a valid bearer JWT. The authenticated user identity is taken from the verified token.",
  ownerManager: "Requires an active organization membership with the owner, admin, or manager role.",
  consumerManager: "Requires an active consumer organization membership with the owner, admin, or manager role.",
  providerManager: "Requires an active provider organization membership with the owner, admin, or manager role.",
  providerApproved: "Requires membership in an active, approved provider organization.",
};

function operation({
  tag, summary, description, auth = false, permission, parameters = [],
  pagination = false, organization = false, bodySchema, bodyExample,
  bodyRequired = true, success = 200, successSchema = "DataEnvelope",
  successExample, errors = [], responseDescription = "Successful response.",
}) {
  const allParameters = [...parameters];
  if (pagination) allParameters.unshift(...pageQueries);
  if (organization) allParameters.push(orgQuery);
  const responses = {
    [success]: response(responseDescription, successSchema, successExample),
    400: response("The request failed input validation.", "Error", { error: "Invalid request." }),
    500: response("Unexpected server error.", "Error", { error: "Internal server error" }),
  };
  if (auth) {
    responses[401] = response("Missing, invalid, expired, or inactive-account authentication.", "Error", { error: "Authentication required." });
  }
  for (const [code, message] of errors) {
    responses[code] = response(message, "Error", { error: message });
  }
  return {
    tags: [tag],
    summary,
    description: [description, auth ? permissions.auth : null, permission].filter(Boolean).join("\n\n"),
    ...(auth ? { security: [{ bearerAuth: [] }] } : {}),
    ...(allParameters.length ? { parameters: allParameters } : {}),
    ...(bodySchema ? { requestBody: body(bodySchema, bodyExample, bodyRequired) } : {}),
    responses,
  };
}

function get(tag, summary, options = {}) {
  return operation({ tag, summary, ...options });
}
function post(tag, summary, options = {}) {
  return operation({ tag, summary, success: options.success || 201, ...options });
}

const paths = {
  "/api/health": {
    get: get("Health", "Check API and database health", {
      successSchema: "HealthResponse",
      successExample: { status: "ok", database: "ok" },
      errors: [[503, "The database is unavailable."]],
    }),
  },
  "/api/v1/health": {
    get: get("Health", "Check API and database health", {
      successSchema: "HealthResponse",
      successExample: { status: "ok", database: "ok" },
      errors: [[503, "The database is unavailable."]],
    }),
  },
  "/api/v1/auth/register": {
    post: post("Authentication", "Register a consumer or provider", {
      bodySchema: "RegisterRequest",
      bodyExample: { firstName: "Jordan", lastName: "Lee", email: "jordan@example.com", password: "ExamplePass123!", organizationName: "Northwind Facilities", organizationType: "consumer", phone: "+1-555-0100" },
      successSchema: "RegistrationResponse",
      successExample: { user: { id: "11111111-1111-4111-8111-111111111111", email: "jordan@example.com", platform_role: "user", status: "active" }, organization: { id: "22222222-2222-4222-8222-222222222222", name: "Northwind Facilities", organization_type: "consumer", status: "active" } },
      errors: [[409, "An account already exists for this email."]],
    }),
  },
  "/api/v1/auth/login": {
    post: post("Authentication", "Authenticate and obtain a JWT", {
      success: 200,
      bodySchema: "LoginRequest",
      bodyExample: { email: "jordan@example.com", password: "ExamplePass123!" },
      successSchema: "LoginResponse",
      successExample: { accessToken: "eyJhbGciOiJIUzI1NiJ9.example.signature", tokenType: "Bearer", expiresIn: 3600 },
      errors: [[401, "Credentials are invalid or the account is inactive."]],
    }),
  },
  "/api/v1/auth/me": {
    get: get("Authentication", "Get the authenticated user's profile and memberships", {
      auth: true, successSchema: "MeResponse",
      successExample: { user: { id: "11111111-1111-4111-8111-111111111111", email: "jordan@example.com", platform_role: "user", status: "active", memberships: [] } },
      errors: [[401, "The token is invalid or the account is inactive."]],
    }),
  },
  "/api/v1/industries": {
    get: get("Industries", "List active industries", {
      pagination: true, successSchema: "ListEnvelope",
      successExample: { data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Manufacturing", isActive: true }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    }),
  },
  "/api/v1/service-categories": {
    get: get("Service Categories", "List active service categories", {
      pagination: true,
      parameters: [query("industryId", "Optionally filter by industry UUID.", uuid)],
      successSchema: "ListEnvelope",
    }),
  },
  "/api/v1/organizations/me": {
    get: get("Organizations", "Get an organization membership's organization", {
      auth: true, organization: true, successSchema: "OrganizationEnvelope",
      permission: "The caller must be an active member of the selected organization.",
      errors: [[404, "No matching active organization membership was found."], [409, "An organizationId is required when multiple memberships make selection ambiguous."]],
    }),
    patch: operation({
      tag: "Organizations", summary: "Update permitted organization details", auth: true,
      organization: true, bodySchema: "OrganizationPatch",
      bodyExample: { name: "Northwind Facilities", city: "Seattle", phone: "+1-555-0100" },
      successSchema: "OrganizationEnvelope",
      permission: permissions.ownerManager,
      errors: [[403, "The caller does not have an organization management role."], [404, "Organization membership was not found."], [409, "An organizationId is required when selection is ambiguous."]],
    }),
  },
  "/api/v1/provider/profile": {
    get: get("Provider", "Get provider profile", {
      auth: true, organization: true, successSchema: "ProviderProfileEnvelope",
      permission: "Requires membership in the selected provider organization.",
      errors: [[404, "Provider profile or membership was not found."], [409, "The selected organization must be a provider organization."]],
    }),
    patch: operation({
      tag: "Provider", summary: "Update editable provider profile fields",
      auth: true, organization: true, bodySchema: "ProviderProfilePatch",
      bodyExample: { description: "Commercial equipment maintenance.", serviceArea: "King County", emergencyAvailable: true, responseTimeHours: 4 },
      successSchema: "ProviderProfileEnvelope", permission: permissions.providerManager,
      errors: [[403, "The caller does not have an organization management role."], [404, "Provider profile or membership was not found."], [409, "The selected organization must be a provider organization."]],
    }),
  },
  "/api/v1/provider/services": {
    get: get("Provider", "List provider services", {
      auth: true, organization: true, successSchema: "ProviderServiceList",
      permission: "Requires membership in the selected provider organization.",
      errors: [[404, "Provider membership was not found."], [409, "The selected organization must be a provider organization."]],
    }),
    post: post("Provider", "Create a provider service", {
      auth: true, organization: true,       bodySchema: "ProviderServiceCreateInput",
      bodyExample: { serviceCategoryId: "33333333-3333-4333-8333-333333333333", name: "HVAC inspection", description: "Annual inspection.", basePrice: 125, currency: "USD" },
      successSchema: "ProviderServiceEnvelope", permission: permissions.providerManager,
      errors: [[403, "A provider organization management role is required."], [404, "Provider membership was not found."]],
    }),
  },
  "/api/v1/provider/services/{id}": {
    patch: operation({
      tag: "Provider", summary: "Update a provider service", auth: true, organization: true,
      parameters: [uuidParam("id", "Provider service UUID.")],
      bodySchema: "ProviderServicePatch", bodyExample: { basePrice: 140, currency: "USD" },
      successSchema: "ProviderServiceEnvelope", permission: permissions.providerManager,
      errors: [[403, "A provider organization management role is required."], [404, "Active provider service was not found."]],
    }),
    delete: operation({
      tag: "Provider", summary: "Deactivate a provider service", auth: true, organization: true,
      parameters: [uuidParam("id", "Provider service UUID.")],
      successSchema: "ProviderServiceEnvelope", permission: permissions.providerManager,
      successExample: { data: { id: "44444444-4444-4444-8444-444444444444", isActive: false } },
      errors: [[403, "A provider organization management role is required."], [404, "Active provider service was not found."]],
    }),
  },
  "/api/v1/marketplace/providers": {
    get: get("Marketplace", "Search approved providers", {
      pagination: true,
      parameters: [
        query("industryId", "Filter by industry UUID.", uuid),
        query("serviceCategoryId", "Filter by active service-category UUID.", uuid),
        query("city", "Filter by city (maximum 100 characters).", { type: "string", maxLength: 100 }),
        query("search", "Search provider listing fields (maximum 100 characters).", { type: "string", maxLength: 100 }),
      ],
      successSchema: "MarketplaceProviderList",
    }),
  },
  "/api/v1/marketplace/providers/{id}": {
    get: get("Marketplace", "Get an approved provider's public profile and services", {
      parameters: [uuidParam("id", "Provider organization UUID.")],
      successSchema: "MarketplaceProviderEnvelope",
      errors: [[404, "Approved provider was not found."]],
    }),
  },
  "/api/v1/admin/providers/{organizationId}/approve": {
    patch: operation({
      tag: "Admin", summary: "Approve a provider profile", auth: true,
      parameters: [uuidParam("organizationId", "Provider organization UUID.")],
      successSchema: "ProviderApprovalEnvelope", permission: "Admin platform role only; providers cannot approve their own organization.",
      errors: [[403, "Administrator access is required or the target is the administrator's own provider organization."], [404, "Provider profile was not found."], [409, "Provider profile is not in an approvable state."]],
    }),
  },
  "/api/v1/admin/providers/{organizationId}/reject": {
    patch: operation({
      tag: "Admin", summary: "Reject a provider profile", auth: true,
      parameters: [uuidParam("organizationId", "Provider organization UUID.")],
      successSchema: "ProviderApprovalEnvelope", permission: "Admin platform role only; providers cannot reject their own organization.",
      errors: [[403, "Administrator access is required or the target is the administrator's own provider organization."], [404, "Provider profile was not found."], [409, "Provider profile is not in a rejectable state."]],
    }),
  },
  "/api/v1/assets": {
    get: get("Assets", "List assets for a consumer organization", {
      auth: true, pagination: true, organization: true,
      parameters: [
        statusQuery(["active", "inactive", "under_maintenance", "retired"]),
        query("category", "Filter by category (maximum 150 characters).", { type: "string", maxLength: 150 }),
      ],
      successSchema: "ListEnvelope", permission: "Requires active membership in the selected consumer organization.",
      errors: [[404, "Consumer organization membership was not found."], [409, "A consumer organization is required; organizationId is required when membership selection is ambiguous."]],
    }),
    post: post("Assets", "Register an asset", {
      auth: true, organization: true, bodySchema: "AssetCreateInput",
      bodyExample: { name: "HVAC Unit 1", category: "HVAC", manufacturer: "Example Manufacturer", model: "Model A", serialNumber: "HVAC-1001", installDate: "2025-01-15" },
      successSchema: "AssetEnvelope", permission: permissions.consumerManager,
      errors: [[403, "A consumer organization management role is required."], [404, "Consumer organization membership was not found."], [409, "The selected organization must be a consumer organization."]],
    }),
  },
  "/api/v1/assets/{id}": {
    get: get("Assets", "Get an asset", {
      auth: true, parameters: [uuidParam("id", "Asset UUID.")], successSchema: "AssetEnvelope",
      permission: "The caller must be an active member of the consumer organization that owns the asset.",
      errors: [[404, "Asset was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Assets", summary: "Update editable asset details", auth: true,
      parameters: [uuidParam("id", "Asset UUID.")], bodySchema: "AssetPatch",
      bodyExample: { location: "Building A, floor 2", warrantyExpiry: "2028-01-15" },
      successSchema: "AssetEnvelope", permission: permissions.consumerManager,
      errors: [[403, "A consumer organization management role is required."], [404, "Asset was not found or is not editable."]],
    }),
    delete: operation({
      tag: "Assets", summary: "Retire an asset without deleting its history", auth: true,
      parameters: [uuidParam("id", "Asset UUID.")], successSchema: "AssetEnvelope",
      permission: permissions.consumerManager,
      errors: [[403, "A consumer organization management role is required."], [404, "Asset was not found or is not accessible."]],
    }),
  },
  "/api/v1/assets/{id}/maintenance-plans": {
    get: get("Maintenance Plans", "List plans for an asset", {
      auth: true, parameters: [uuidParam("id", "Asset UUID.")],
      successSchema: "MaintenancePlanList",
      permission: "The caller must be an active member of the consumer organization that owns the asset.",
      errors: [[404, "Asset was not found or is not accessible."]],
    }),
    post: post("Maintenance Plans", "Create an asset maintenance plan", {
      auth: true, parameters: [uuidParam("id", "Asset UUID.")],
      bodySchema: "MaintenancePlanInput",
      bodyExample: { providerOrganizationId: "55555555-5555-4555-8555-555555555555", frequency: "quarterly", nextDueAt: "2027-01-15T09:00:00Z" },
      successSchema: "MaintenancePlanEnvelope",
      permission: "Consumer organization owner/admin/manager; the assigned provider must be active and approved.",
      errors: [[403, "A consumer organization management role is required."], [404, "Asset or provider was not found."], [409, "A matching active plan already exists or the provider is not eligible."]],
    }),
  },
  "/api/v1/maintenance-plans/{id}": {
    patch: operation({
      tag: "Maintenance Plans", summary: "Update or reactivate a maintenance plan",
      auth: true, parameters: [uuidParam("id", "Maintenance plan UUID.")],
      bodySchema: "MaintenancePlanPatch",
      bodyExample: { frequency: "monthly", isActive: true },
      successSchema: "MaintenancePlanEnvelope", permission: permissions.consumerManager,
      errors: [[403, "A consumer organization management role is required."], [404, "Plan was not found or is not accessible."], [409, "A conflicting active plan already exists."]],
    }),
    delete: operation({
      tag: "Maintenance Plans", summary: "Deactivate a maintenance plan",
      auth: true, parameters: [uuidParam("id", "Maintenance plan UUID.")],
      successSchema: "MaintenancePlanEnvelope", permission: permissions.consumerManager,
      errors: [[403, "A consumer organization management role is required."], [404, "Plan was not found or is not accessible."]],
    }),
  },
  "/api/v1/requests": {
    get: get("Service Requests", "List accessible service requests", {
      auth: true, pagination: true, organization: true,
      parameters: [statusQuery(["draft", "submitted", "assigned", "quoted", "accepted", "in_progress", "completed", "cancelled", "rejected"]), priorityQuery],
      successSchema: "ListEnvelope",
      permission: "Consumers see their organization's requests; providers see requests they are eligible to access; active administrators may list across organizations.",
    }),
    post: post("Service Requests", "Create a consumer service request", {
      auth: true, organization: true, bodySchema: "ServiceRequestInput",
      bodyExample: { assetId: "66666666-6666-4666-8666-666666666666", serviceCategoryId: "33333333-3333-4333-8333-333333333333", description: "Inspect and repair the cooling unit.", priority: "normal", preferredAt: "2026-11-03T09:00:00Z" },
      successSchema: "ServiceRequestEnvelope", permission: permissions.consumerManager,
      errors: [[400, "Invalid request references or values."], [403, "Consumer organization management role is required."], [409, "Organization selection is ambiguous or not compatible."]],
    }),
  },
  "/api/v1/requests/{id}": {
    get: get("Service Requests", "Get an accessible service request", {
      auth: true, parameters: [uuidParam("id", "Service request UUID.")],
      successSchema: "ServiceRequestEnvelope",
      permission: "Accessible to the consumer organization, eligible provider organizations, and active administrators.",
      errors: [[404, "Service request was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Service Requests", summary: "Update a submitted service request",
      auth: true, parameters: [uuidParam("id", "Service request UUID.")],
      bodySchema: "ServiceRequestPatch", bodyExample: { description: "Inspect the cooling unit and replace the filter." },
      successSchema: "ServiceRequestEnvelope", permission: permissions.consumerManager,
      errors: [[404, "Service request was not found or is not accessible."], [409, "Only submitted requests can be edited."]],
    }),
    delete: operation({
      tag: "Service Requests", summary: "Cancel an eligible service request",
      auth: true, parameters: [uuidParam("id", "Service request UUID.")],
      successSchema: "ActionResult", permission: permissions.consumerManager,
      errors: [[404, "Request was not found or cannot be cancelled by this account."], [409, "Request status does not allow cancellation."]],
    }),
  },
  "/api/v1/provider/requests": {
    get: get("Provider", "Discover service requests matching a provider organization", {
      auth: true, pagination: true, organization: true,
      parameters: [statusQuery(["draft", "submitted", "assigned", "quoted", "accepted", "in_progress", "completed", "cancelled", "rejected"]), priorityQuery],
      successSchema: "ListEnvelope", permission: permissions.providerApproved,
      errors: [[403, "An approved provider organization is required."], [409, "Organization selection is ambiguous."]],
    }),
  },
  "/api/v1/requests/{requestId}/quotes": {
    get: get("Quotes", "List quotes visible to the caller", {
      auth: true, parameters: [uuidParam("requestId", "Service request UUID.")],
      successSchema: "QuoteList", permission: "Consumers can view quotes for their requests; providers can view their own quotes for an eligible request.",
      errors: [[404, "Request was not found or is not accessible."]],
    }),
    post: post("Quotes", "Create a provider draft quote", {
      auth: true, organization: true, parameters: [uuidParam("requestId", "Service request UUID.")],
      bodySchema: "QuoteCreateInput",
      bodyExample: { currency: "USD", taxAmount: "5.00", estimatedDays: 2, validUntil: "2026-12-01", items: [{ description: "Inspection and repair", quantity: "1", unitPrice: "125.00" }] },
      successSchema: "QuoteEnvelope", permission: permissions.providerApproved,
      errors: [[403, "An approved provider organization is required."], [404, "Request is unavailable to this provider."], [409, "Quote already exists or request is no longer available."]],
    }),
  },
  "/api/v1/requests/{requestId}/messages": {
    get: get("Messages", "List service request messages", {
      auth: true, parameters: [uuidParam("requestId", "Service request UUID.")],
      successSchema: "MessageList",
      permission: "Accessible to active consumer members and members of the targeted/quoting approved provider organization.",
      errors: [[404, "Request is not accessible."]],
    }),
    post: post("Messages", "Post a service request message", {
      auth: true, parameters: [uuidParam("requestId", "Service request UUID.")],
      bodySchema: "MessageInput", bodyExample: { message: "Can you confirm the available service dates?" },
      successSchema: "MessageEnvelope",
      permission: "Accessible to active consumer members and members of the targeted/quoting approved provider organization.",
      errors: [[404, "Request is not accessible."]],
    }),
  },
  "/api/v1/quotes/{quoteId}": {
    get: get("Quotes", "Get a quote", {
      auth: true, parameters: [uuidParam("quoteId", "Quote UUID.")],
      successSchema: "QuoteEnvelope",
      permission: "Providers can view their quote; consumers can view submitted or later quotes for their request.",
      errors: [[404, "Quote was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Quotes", summary: "Update a provider draft quote", auth: true, organization: true,
      parameters: [uuidParam("quoteId", "Quote UUID.")], bodySchema: "QuotePatch",
      bodyExample: { taxAmount: "6.00", notes: "Includes parts." }, successSchema: "QuoteEnvelope",
      permission: permissions.providerManager,
      errors: [[404, "Quote was not found or is not accessible."], [409, "Only draft quotes for available requests can be edited."]],
    }),
  },
  "/api/v1/quotes/{quoteId}/submit": {
    post: operation({
      tag: "Quotes", summary: "Submit a provider draft quote", auth: true, organization: true,
      parameters: [uuidParam("quoteId", "Quote UUID.")], successSchema: "QuoteEnvelope",
      permission: permissions.providerManager,
      errors: [[404, "Quote is not available to this provider."], [409, "Only an eligible draft quote can be submitted."]],
    }),
  },
  "/api/v1/quotes/{quoteId}/accept": {
    post: operation({
      tag: "Quotes", summary: "Accept a submitted quote", auth: true,
      parameters: [uuidParam("quoteId", "Quote UUID.")], successSchema: "QuoteEnvelope",
      permission: permissions.consumerManager,
      description: "Acceptance is atomic: competing submitted quotes are rejected and other drafts cancelled.",
      errors: [[404, "Quote is not accessible to the consumer."], [409, "Quote is not submitted or has expired."]],
    }),
  },
  "/api/v1/quotes/{quoteId}/reject": {
    post: operation({
      tag: "Quotes", summary: "Reject a submitted quote", auth: true,
      parameters: [uuidParam("quoteId", "Quote UUID.")], successSchema: "QuoteEnvelope",
      permission: permissions.consumerManager,
      errors: [[404, "Quote is not accessible to the consumer."], [409, "Quote is not submitted."]],
    }),
  },
  "/api/v1/contracts": {
    get: get("Contracts", "List contracts", {
      auth: true, pagination: true, organization: true,
      parameters: [statusQuery(["draft", "sent", "accepted", "rejected", "expired", "active", "completed", "cancelled"])],
      successSchema: "ListEnvelope",
      permission: "Active members of either contract party can list their organization's records; administrators can list records.",
      errors: [[404, "Active organization membership was not found."], [409, "organizationId is required when multiple memberships exist."]],
    }),
    post: post("Contracts", "Create a contract from an accepted quote", {
      auth: true, bodySchema: "ContractInput",
      bodyExample: { quoteId: "77777777-7777-4777-8777-777777777777", terms: "Service terms.", startDate: "2026-11-01", endDate: "2026-11-30" },
      successSchema: "ContractEnvelope", permission: permissions.consumerManager,
      description: "Request, parties, currency, and total are derived from the accepted quote. Only one non-cancelled contract per request is allowed.",
      errors: [[403, "Consumer organization management role is required."], [409, "An accepted quote is required or a non-cancelled contract already exists."]],
    }),
  },
  "/api/v1/contracts/{id}": {
    get: get("Contracts", "Get a contract", {
      auth: true, parameters: [uuidParam("id", "Contract UUID.")],
      successSchema: "ContractEnvelope", permission: "Active members of either contract party; active administrators.",
      errors: [[404, "Contract was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Contracts", summary: "Edit a draft contract", auth: true,
      parameters: [uuidParam("id", "Contract UUID.")], bodySchema: "ContractPatch",
      bodyExample: { terms: "Updated service terms.", endDate: "2026-12-15" },
      successSchema: "ContractEnvelope", permission: permissions.consumerManager,
      errors: [[403, "Only consumer organization managers may edit the contract."], [404, "Contract was not found."], [409, "Only draft contracts can be edited."]],
    }),
  },
  "/api/v1/contracts/{id}/send": {},
  "/api/v1/contracts/{id}/accept": {},
  "/api/v1/contracts/{id}/activate": {},
  "/api/v1/contracts/{id}/complete": {},
  "/api/v1/contracts/{id}/cancel": {},
  "/api/v1/contracts/{contractId}/work-orders": {
    post: post("Work Orders", "Create a work order from an active contract", {
      auth: true, parameters: [uuidParam("contractId", "Contract UUID.")],
      bodySchema: "WorkOrderInput",
      bodyExample: { priority: "normal", scheduledStartAt: "2026-11-03T09:00:00Z", scheduledEndAt: "2026-11-03T12:00:00Z", estimatedCost: "105.00", notes: "Bring replacement filters." },
      bodyRequired: false, successSchema: "WorkOrderEnvelope", permission: permissions.providerManager,
      errors: [[404, "Contract is not available to this provider."], [409, "An active contract is required or a work order already exists."]],
    }),
  },
  "/api/v1/work-orders": {
    get: get("Work Orders", "List work orders", {
      auth: true, pagination: true, organization: true,
      parameters: [statusQuery(["pending", "scheduled", "in_progress", "completed", "cancelled"])],
      successSchema: "ListEnvelope",
      permission: "Active members of either related organization; active administrators can list all.",
      errors: [[404, "Active organization membership was not found."], [409, "organizationId is required when multiple memberships exist."]],
    }),
  },
  "/api/v1/work-orders/{id}": {
    get: get("Work Orders", "Get a work order", {
      auth: true, parameters: [uuidParam("id", "Work order UUID.")],
      successSchema: "WorkOrderEnvelope", permission: "Active members of either related organization; active administrators.",
      errors: [[404, "Work order was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Work Orders", summary: "Update pending or scheduled work order details",
      auth: true, parameters: [uuidParam("id", "Work order UUID.")],
      bodySchema: "WorkOrderPatch", bodyExample: { scheduledStartAt: "2026-11-04T09:00:00Z", notes: "Updated schedule." },
      successSchema: "WorkOrderEnvelope", permission: permissions.providerManager,
      errors: [[403, "Provider organization management role is required."], [404, "Work order was not found."], [409, "Work order status does not allow edits."]],
    }),
  },
  "/api/v1/work-orders/{id}/assign": {
    post: post("Work Orders", "Assign a technician", {
      auth: true, parameters: [uuidParam("id", "Work order UUID.")],
      bodySchema: "AssignmentInput",
      bodyExample: { technicianId: "88888888-8888-4888-8888-888888888888", note: "Assigned for site visit." },
      successSchema: "WorkOrderEnvelope", permission: permissions.providerManager,
      description: "Technician must be active and have an active technician membership in this active, approved provider organization. Assignment sets status to scheduled.",
      errors: [[400, "Technician or schedule is invalid."], [404, "Work order is not available to this provider."], [409, "Work order status does not allow assignment."]],
    }),
  },
  "/api/v1/work-orders/{id}/start": {},
  "/api/v1/work-orders/{id}/complete": {},
  "/api/v1/work-orders/{id}/cancel": {},
  "/api/v1/work-orders/{id}/events": {
    get: get("Work Orders", "List work order event history", {
      auth: true, parameters: [uuidParam("id", "Work order UUID.")],
      successSchema: "WorkOrderEventList", permission: "The caller must be authorized to access the work order.",
      errors: [[404, "Work order was not found or is not accessible."]],
    }),
  },
  "/api/v1/invoices": {
    get: get("Invoices", "List invoices", {
      auth: true, pagination: true, organization: true,
      parameters: [statusQuery(["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"])],
      successSchema: "ListEnvelope",
      permission: "Organization members can list their party's invoices; active administrators can list all. organizationId selects a membership when needed.",
      errors: [[404, "Membership was not found."], [409, "organizationId is required when multiple memberships exist."]],
    }),
    post: post("Invoices", "Create an invoice for completed work", {
      auth: true, bodySchema: "InvoiceInput",
      bodyExample: { workOrderId: "99999999-9999-4999-8999-999999999999", taxRate: "5.00", dueAt: "2027-01-31T23:59:59Z", notes: "Completed work", items: [{ description: "Maintenance service", quantity: "1", unitPrice: "100.00" }] },
      successSchema: "InvoiceEnvelope", permission: permissions.providerManager,
      description: "Requires a completed work order and matching active/completed contract from an active, approved provider. Invoice parties and currency are derived from the work order.",
      errors: [[403, "Provider organization management role is required."], [409, "Work is not billable or a non-cancelled invoice already exists."]],
    }),
  },
  "/api/v1/invoices/{id}": {
    get: get("Invoices", "Get invoice and computed balance", {
      auth: true, parameters: [uuidParam("id", "Invoice UUID.")], successSchema: "InvoiceEnvelope",
      permission: "Accessible to members of either invoice party and active administrators.",
      errors: [[404, "Invoice was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Invoices", summary: "Edit a draft invoice", auth: true,
      parameters: [uuidParam("id", "Invoice UUID.")], bodySchema: "InvoicePatch",
      bodyExample: { taxRate: "5.00", notes: "Updated notes." },
      successSchema: "InvoiceEnvelope", permission: permissions.providerManager,
      errors: [[403, "Provider organization management role is required."], [404, "Invoice was not found."], [409, "Only draft invoices can be edited."]],
    }),
  },
  "/api/v1/invoices/{id}/issue": {},
  "/api/v1/invoices/{id}/cancel": {},
  "/api/v1/invoices/{id}/payments": {
    get: get("Payments", "List payments for an invoice", {
      auth: true, pagination: true, parameters: [
        uuidParam("id", "Invoice UUID."),
        statusQuery(["pending", "completed", "failed", "refunded"]),
      ],
      successSchema: "ListEnvelope", permission: "Accessible to invoice parties and active administrators.",
      errors: [[404, "Invoice was not found or is not accessible."]],
    }),
    post: post("Payments", "Record a consumer payment", {
      auth: true, parameters: [uuidParam("id", "Invoice UUID.")],
      bodySchema: "PaymentInput", bodyExample: { amount: "50.00", currency: "USD", method: "manual", reference: "RECEIPT-123" },
      successSchema: "PaymentEnvelope", permission: permissions.consumerManager,
      description: "Creates a pending ledger entry. Currency must match the invoice and the amount cannot exceed the outstanding balance. No external payment gateway is integrated.",
      errors: [[404, "Invoice was not found or is not accessible to this consumer."], [409, "Invoice status or balance does not allow this payment."]],
    }),
  },
  "/api/v1/payments/{id}": {
    get: get("Payments", "Get a payment", {
      auth: true, parameters: [uuidParam("id", "Payment UUID.")],
      successSchema: "PaymentEnvelope", permission: "Accessible to members of either invoice party and active administrators.",
      errors: [[404, "Payment was not found or is not accessible."]],
    }),
  },
  "/api/v1/payments/{id}/confirm": {},
  "/api/v1/payments/{id}/fail": {},
  "/api/v1/payments/{id}/refund": {},
  "/api/v1/notifications": {
    get: get("Notifications", "List the authenticated user's notifications", {
      auth: true, pagination: true,
      parameters: [query("unreadOnly", "Filter to unread (true) or read (false) notifications.", { type: "boolean" })],
      successSchema: "ListEnvelope",
    }),
  },
  "/api/v1/notifications/unread-count": {
    get: get("Notifications", "Get unread notification count", {
      auth: true, successSchema: "CountEnvelope", successExample: { data: { count: 2 } },
    }),
  },
  "/api/v1/notifications/read-all": {
    post: operation({
      tag: "Notifications", summary: "Mark all notifications as read", auth: true,
      bodySchema: "EmptyAction", bodyRequired: false, successSchema: "UpdatedCountEnvelope",
      successExample: { data: { updated: 2 } },
    }),
  },
  "/api/v1/notifications/{id}": {
    get: get("Notifications", "Get an owned notification", {
      auth: true, parameters: [uuidParam("id", "Notification UUID.")], successSchema: "NotificationEnvelope",
      errors: [[404, "Notification was not found."]],
    }),
  },
  "/api/v1/notifications/{id}/read": {
    post: operation({
      tag: "Notifications", summary: "Mark one notification as read", auth: true,
      parameters: [uuidParam("id", "Notification UUID.")], bodySchema: "EmptyAction",
      bodyRequired: false, successSchema: "NotificationEnvelope",
      errors: [[404, "Notification was not found."]],
    }),
  },
  "/api/v1/support/tickets": {
    get: get("Support", "List own support tickets or all tickets for support staff", {
      auth: true, pagination: true,
      parameters: [statusQuery(["open", "in_progress", "resolved", "closed"]), priorityQuery],
      successSchema: "ListEnvelope",
      permission: "Regular users see their own tickets; active admin/support staff can see all tickets.",
    }),
    post: post("Support", "Create a support ticket", {
      auth: true, bodySchema: "TicketInput",
      bodyExample: { subject: "Equipment issue", description: "The unit stops during operation.", category: "equipment", priority: "normal" },
      successSchema: "TicketEnvelope",
      description: "Ticket schema has no organization or business-record relationship; visibility is based on creator or active support/admin role.",
    }),
  },
  "/api/v1/support/tickets/{id}": {
    get: get("Support", "Get a support ticket", {
      auth: true, parameters: [uuidParam("id", "Support ticket UUID.")],
      successSchema: "TicketEnvelope", permission: "Ticket creator or active admin/support staff.",
      errors: [[404, "Support ticket was not found or is not accessible."]],
    }),
    patch: operation({
      tag: "Support", summary: "Update an editable ticket", auth: true,
      parameters: [uuidParam("id", "Support ticket UUID.")], bodySchema: "TicketPatch",
      bodyExample: { priority: "high", assignedToUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      successSchema: "TicketEnvelope",
      permission: "Creator may edit their own open ticket; staff may edit supported fields and assignments. Only support/admin can assign.",
      errors: [[403, "Only support staff can change assignment."], [404, "Ticket was not found or is not editable."]],
    }),
  },
  "/api/v1/support/tickets/{id}/messages": {
    get: get("Support", "List ticket messages", {
      auth: true, pagination: true, parameters: [uuidParam("id", "Support ticket UUID.")],
      successSchema: "TicketMessageList", permission: "Ticket creator or active admin/support staff.",
      errors: [[404, "Ticket was not found or is not accessible."]],
    }),
    post: post("Support", "Add a ticket message", {
      auth: true, parameters: [uuidParam("id", "Support ticket UUID.")],
      bodySchema: "MessageInput", bodyExample: { message: "It happened again this morning." },
      successSchema: "TicketMessageEnvelope", permission: "Ticket creator or active admin/support staff.",
      errors: [[404, "Ticket was not found or is not accessible."], [409, "Closed tickets cannot receive messages until reopened."]],
    }),
  },
  "/api/v1/support/tickets/{id}/resolve": {},
  "/api/v1/support/tickets/{id}/close": {},
  "/api/v1/support/tickets/{id}/reopen": {},
  "/api/v1/reviews": {
    get: get("Reviews", "List public reviews for approved providers", {
      auth: true, pagination: true,
      parameters: [query("providerOrganizationId", "Optionally filter by provider organization UUID.", uuid)],
      successSchema: "ListEnvelope",
    }),
    post: post("Reviews", "Review an eligible completed service request", {
      auth: true, bodySchema: "ReviewInput",
      bodyExample: { serviceRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", rating: 5, comment: "Responsive and professional service." },
      successSchema: "ReviewEnvelope", permission: permissions.consumerManager,
      description: "Requires a completed request and a completed work order for its provider. The database allows one review per service request.",
      errors: [[404, "Request is not accessible."], [409, "Request/work is not complete or this request already has a review."]],
    }),
  },
  "/api/v1/reviews/{id}": {
    get: get("Reviews", "Get a public provider review", {
      auth: true, parameters: [uuidParam("id", "Review UUID.")],
      successSchema: "ReviewEnvelope", errors: [[404, "Review was not found."]],
    }),
    patch: operation({
      tag: "Reviews", summary: "Edit the current user's review", auth: true,
      parameters: [uuidParam("id", "Review UUID.")], bodySchema: "ReviewPatch",
      bodyExample: { rating: 4, comment: "Updated review." }, successSchema: "ReviewEnvelope",
      permission: "Only the authenticated review author can edit the review.",
      errors: [[404, "Review was not found or is not editable by this account."]],
    }),
  },
  "/api/v1/attachments": {
    get: get("Attachments", "List attachment metadata for an authorized parent", {
      auth: true, pagination: true,
      parameters: [
        query("serviceRequestId", "Service request UUID; provide exactly one parent selector.", uuid),
        query("ticketId", "Support ticket UUID; provide exactly one parent selector.", uuid),
      ],
      successSchema: "ListEnvelope",
      description: "Provide exactly one of serviceRequestId or ticketId.",
      permission: "Parent access is required. Service-request access follows request participation; ticket access follows ticket ownership/staff access.",
    }),
    post: post("Attachments", "Create attachment metadata", {
      auth: true, bodySchema: "AttachmentInput",
      bodyExample: { ticketId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", storageKey: "tickets/cccccccc/report.pdf", fileName: "report.pdf", mimeType: "application/pdf", sizeBytes: 24576 },
      successSchema: "AttachmentEnvelope",
      description: "Metadata only. No file upload, download, storage-key verification, or binary storage integration is configured. Exactly one of serviceRequestId or ticketId is required; storageKey must not contain path traversal segments.",
      errors: [[404, "Parent was not found or is not accessible."]],
    }),
  },
  "/api/v1/attachments/{id}": {
    get: get("Attachments", "Get accessible attachment metadata", {
      auth: true, parameters: [uuidParam("id", "Attachment UUID.")],
      successSchema: "AttachmentEnvelope", errors: [[404, "Attachment was not found or is not accessible."]],
    }),
    delete: operation({
      tag: "Attachments", summary: "Delete attachment metadata", auth: true,
      parameters: [uuidParam("id", "Attachment UUID.")], successSchema: "DeletedEnvelope",
      errors: [[404, "Attachment was not found or is not accessible."]],
    }),
  },
};

const emptyAction = (tag, summary, pathParam, permission, errors = []) =>
  operation({
    tag, summary, auth: true,
    parameters: pathParam ? [uuidParam(pathParam, `${tag} UUID.`)] : [],
    bodySchema: "EmptyAction", bodyRequired: false, successSchema: "ActionEnvelope",
    permission, errors,
  });

for (const [path, action, label, permission, errors] of [
  ["/api/v1/contracts/{id}/send", "send", "Send a draft contract", permissions.consumerManager, [[404, "Contract was not found or is not accessible."], [409, "Only a draft contract can be sent."]]],
  ["/api/v1/contracts/{id}/accept", "accept", "Accept a sent contract", permissions.providerManager, [[404, "Contract was not found or is not accessible."], [409, "Only a sent contract can be accepted."]]],
  ["/api/v1/contracts/{id}/activate", "activate", "Activate an accepted contract", "An authorized owner/admin/manager from either contract party.", [[404, "Contract was not found or is not accessible."], [409, "Only an accepted contract can be activated."]]],
  ["/api/v1/contracts/{id}/complete", "complete", "Complete a contract after its work order", permissions.consumerManager, [[404, "Contract was not found or is not accessible."], [409, "The associated work order must be completed first."]]],
  ["/api/v1/contracts/{id}/cancel", "cancel", "Cancel an eligible contract", "An authorized owner/admin/manager from either contract party.", [[404, "Contract was not found or is not accessible."], [409, "Current work-order state prevents cancellation."]]],
]) {
  paths[path].post = emptyAction("Contracts", label, "id", permission, errors);
  paths[path].post.responses[200] = response("Contract updated.", "ContractEnvelope");
}

for (const path of ["/api/health", "/api/v1/health"]) {
  paths[path].get.responses[503] = response(
    "The database is unavailable.",
    "HealthResponse",
    { status: "error", database: "unavailable" }
  );
}

for (const [path, label, permission, bodySchema, errors] of [
  ["/api/v1/work-orders/{id}/start", "Start a scheduled work order", "Assigned technician or provider owner/admin/manager.", "EmptyAction", [[404, "Work order is not accessible."], [409, "Only a scheduled work order can be started."]]],
  ["/api/v1/work-orders/{id}/complete", "Complete an in-progress work order", "Assigned technician or provider owner/admin/manager.", "CompletionInput", [[404, "Work order is not accessible."], [409, "Only an in-progress work order can be completed."]]],
  ["/api/v1/work-orders/{id}/cancel", "Cancel an eligible work order", "Consumer or provider owner/admin/manager.", "EmptyAction", [[404, "Work order is not accessible."], [409, "Current work-order state does not allow cancellation."]]],
]) {
  paths[path].post = operation({
    tag: "Work Orders", summary: label, auth: true,
    parameters: [uuidParam("id", "Work order UUID.")],
    bodySchema, bodyRequired: bodySchema !== "EmptyAction",
    successSchema: "WorkOrderEnvelope", permission, errors,
    ...(bodySchema === "CompletionInput" ? { bodyExample: { actualCost: "105.00", note: "Work completed." } } : {}),
  });
  if (path.endsWith("/start") || path.endsWith("/cancel")) {
    paths[path].post.description += "\n\nKnown implementation gap: the current controller calls an undefined action-note validator for this action, so requests currently fail with HTTP 500.";
    paths[path].post.responses[500] = response(
      "Current implementation gap: the controller references an undefined action-note validator for this route.",
      "Error",
      { error: "Internal server error" }
    );
    delete paths[path].post.responses[200];
  }
}

for (const [path, label, permission, errors] of [
  ["/api/v1/invoices/{id}/issue", "Issue a draft invoice", permissions.providerManager, [[404, "Invoice is not available to this provider."], [409, "A future due date and positive invoice total are required."]]],
  ["/api/v1/invoices/{id}/cancel", "Cancel an unpaid invoice", permissions.providerManager, [[404, "Invoice is not available to this provider."], [409, "Invoice state or existing payments prevent cancellation."]]],
]) {
  paths[path].post = emptyAction("Invoices", label, "id", permission, errors);
  paths[path].post.responses[200] = response("Invoice updated.", "InvoiceEnvelope");
}

for (const [path, label, errors] of [
  ["/api/v1/payments/{id}/confirm", "Confirm a pending payment", [[404, "Payment is not available to this provider."], [409, "Payment or invoice state/balance prevents confirmation."]]],
  ["/api/v1/payments/{id}/fail", "Mark a pending payment as failed", [[404, "Payment is not available to this provider."], [409, "Only pending payments can be failed."]]],
  ["/api/v1/payments/{id}/refund", "Refund a completed payment", [[404, "Payment is not available to this provider."], [409, "Only completed payments can be refunded."]]],
]) {
  paths[path].post = emptyAction("Payments", label, "id", permissions.providerManager, errors);
  paths[path].post.responses[200] = response("Payment updated.", "PaymentEnvelope");
}

for (const [path, label, permission, errors] of [
  ["/api/v1/support/tickets/{id}/resolve", "Resolve an open or in-progress ticket", "Active admin/support staff only.", [[403, "Only support staff can resolve tickets."], [404, "Ticket was not found."], [409, "Ticket state does not allow resolution."]]],
  ["/api/v1/support/tickets/{id}/close", "Close an eligible ticket", "Ticket creator or active admin/support staff.", [[404, "Ticket was not found or is not accessible."], [409, "Ticket state does not allow closing."]]],
  ["/api/v1/support/tickets/{id}/reopen", "Reopen a closed ticket", "Ticket creator or active admin/support staff.", [[404, "Ticket was not found or is not accessible."], [409, "Only closed tickets can be reopened."]]],
]) {
  paths[path].post = emptyAction("Support", label, "id", permission, errors);
  paths[path].post.responses[200] = response("Ticket updated.", "TicketEnvelope");
}

schemas.RegistrationResponse = objectSchema({
  user: objectSchema({
    id: uuid, first_name: string(100), last_name: nullable(string(100)),
    email: { type: "string", format: "email" }, phone: nullable(string(30)),
    platform_role: { type: "string", enum: ["user", "admin", "support"] },
    status: { type: "string", enum: ["active", "inactive", "suspended", "pending"] },
    created_at: { type: "string", format: "date-time" },
  }, ["id", "first_name", "email", "platform_role", "status"]),
  organization: objectSchema({
    id: uuid, name: string(200),
    organization_type: { type: "string", enum: ["consumer", "provider"] },
    status: { type: "string", enum: ["active", "inactive", "pending", "suspended"] },
  }, ["id", "name", "organization_type", "status"]),
}, ["user", "organization"]);
schemas.ProviderApproval = objectSchema({
  organizationId: uuid,
  status: { type: "string", enum: ["approved", "rejected"] },
  verifiedAt: nullable({ type: "string", format: "date-time" }),
}, ["organizationId", "status", "verifiedAt"]);
schemas.ProviderApprovalEnvelope = objectSchema({ data: ref("ProviderApproval") }, ["data"]);
schemas.MarketplaceService = objectSchema({
  id: uuid, name: string(200), description: nullable(string(5000)),
  basePrice: nullable({ oneOf: [{ type: "number" }, { type: "string" }] }),
  currency: { type: "string", pattern: "^[A-Z]{3}$" },
  serviceCategoryId: nullable(uuid), serviceCategoryName: nullable(string(150)),
}, ["id", "name", "currency"]);
schemas.MarketplaceProvider = objectSchema({
  id: uuid, name: string(200), city: nullable(string(100)), state: nullable(string(100)),
  country: nullable(string(100)), industryId: nullable(uuid), industryName: nullable(string(150)),
  description: nullable(string(5000)), websiteUrl: nullable({ type: "string", format: "uri" }),
  serviceArea: nullable(string(500)), emergencyAvailable: { type: "boolean" },
  responseTimeHours: nullable({ type: "integer", minimum: 0 }),
  services: { type: "array", items: ref("MarketplaceService") },
}, ["id", "name", "services"]);
schemas.MarketplaceProviderEnvelope = objectSchema({ data: ref("MarketplaceProvider") }, ["data"]);
schemas.MarketplaceProviderList = objectSchema({
  data: { type: "array", items: ref("MarketplaceProvider") },
  pagination: ref("Pagination"),
}, ["data", "pagination"]);
schemas.ProviderServiceCreateInput = { ...schemas.ProviderServiceInput, required: ["name"] };
schemas.ProviderServicePatch = { ...schemas.ProviderServiceInput, required: undefined };
schemas.AssetCreateInput = { ...schemas.AssetInput, required: ["name"] };
schemas.LoginResponse = objectSchema({
  accessToken: { type: "string", description: "Signed HS256 JWT; valid for one hour." },
  tokenType: { type: "string", enum: ["Bearer"] }, expiresIn: { type: "integer", example: 3600 },
}, ["accessToken", "tokenType", "expiresIn"]);
schemas.MeResponse = objectSchema({ user: ref("User") }, ["user"]);
schemas.OrganizationEnvelope = objectSchema({ data: ref("Organization") }, ["data"]);
schemas.ProviderProfileEnvelope = objectSchema({ data: ref("ProviderProfile") }, ["data"]);
schemas.ProviderServiceEnvelope = objectSchema({ data: ref("ProviderService") }, ["data"]);
schemas.ProviderServiceList = objectSchema({ data: { type: "array", items: ref("ProviderService") } }, ["data"]);
schemas.AssetEnvelope = objectSchema({ data: ref("Asset") }, ["data"]);
schemas.MaintenancePlanEnvelope = objectSchema({ data: ref("MaintenancePlan") }, ["data"]);
schemas.MaintenancePlanList = objectSchema({ data: { type: "array", items: ref("MaintenancePlan") } }, ["data"]);
schemas.ServiceRequestEnvelope = objectSchema({ data: ref("ServiceRequest") }, ["data"]);
schemas.QuoteEnvelope = objectSchema({ data: ref("Quote") }, ["data"]);
schemas.QuoteList = objectSchema({ data: { type: "array", items: ref("Quote") } }, ["data"]);
schemas.MessageEnvelope = objectSchema({ data: jsonObject }, ["data"]);
schemas.MessageList = objectSchema({ data: { type: "array", items: ref("TicketMessage") } }, ["data"]);
schemas.ContractEnvelope = objectSchema({ data: ref("Contract") }, ["data"]);
schemas.WorkOrderEnvelope = objectSchema({ data: ref("WorkOrder") }, ["data"]);
schemas.WorkOrderEventList = objectSchema({ data: { type: "array", items: ref("WorkOrderEvent") } }, ["data"]);
schemas.InvoiceEnvelope = objectSchema({ data: ref("Invoice") }, ["data"]);
schemas.PaymentEnvelope = objectSchema({ data: ref("Payment") }, ["data"]);
schemas.NotificationEnvelope = objectSchema({ data: ref("Notification") }, ["data"]);
schemas.CountEnvelope = objectSchema({ data: objectSchema({ count: { type: "integer", minimum: 0 } }, ["count"]) }, ["data"]);
schemas.UpdatedCountEnvelope = objectSchema({ data: objectSchema({ updated: { type: "integer", minimum: 0 } }, ["updated"]) }, ["data"]);
schemas.TicketEnvelope = objectSchema({ data: ref("SupportTicket") }, ["data"]);
schemas.TicketMessageEnvelope = objectSchema({ data: ref("TicketMessage") }, ["data"]);
schemas.ServiceRequestMessage = objectSchema({
  id: uuid, serviceRequestId: uuid, senderUserId: uuid,
  senderFirstName: string(100), senderLastName: nullable(string(100)),
  message: { type: "string" }, createdAt: { type: "string", format: "date-time" },
}, ["id", "serviceRequestId", "senderUserId", "message", "createdAt"]);
schemas.MessageEnvelope = objectSchema({ data: ref("ServiceRequestMessage") }, ["data"]);
schemas.MessageList = objectSchema({
  data: { type: "array", items: ref("ServiceRequestMessage") },
}, ["data"]);
schemas.TicketMessageList = objectSchema({
  data: { type: "array", items: ref("TicketMessage") },
  pagination: ref("Pagination"),
}, ["data", "pagination"]);
schemas.ReviewEnvelope = objectSchema({ data: ref("Review") }, ["data"]);
schemas.AttachmentEnvelope = objectSchema({ data: ref("Attachment") }, ["data"]);
schemas.DeletedEnvelope = objectSchema({ data: objectSchema({ id: uuid, deleted: { type: "boolean" } }, ["id", "deleted"]) }, ["data"]);
schemas.ActionResult = objectSchema({ id: uuid, status: { type: "string" } }, ["id", "status"]);
schemas.ActionEnvelope = objectSchema({ data: ref("ActionResult") }, ["data"]);
schemas.QuoteCreateInput = { ...schemas.QuoteInput, required: ["items"] };
schemas.ServiceRequestInput.anyOf = [
  { required: ["serviceCategoryId"] },
  { required: ["serviceType"] },
];
schemas.ServiceRequestPatch = objectSchema(
  Object.fromEntries(Object.entries(schemas.ServiceRequestInput.properties)
    .filter(([field]) => field !== "providerOrganizationId"))
);
schemas.QuotePatch = { ...schemas.QuoteInput, required: undefined };
schemas.AssetPatch = { ...schemas.AssetInput, required: undefined };
schemas.MaintenancePlanInput.required = ["providerOrganizationId", "frequency"];
schemas.MaintenancePlanPatch = { ...schemas.MaintenancePlanInput, required: undefined };
schemas.WorkOrderPatch = { ...schemas.WorkOrderInput, required: undefined };

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "FYP Backend API",
    version: "1.0.0",
    description: "OpenAPI documentation for the existing FMS backend. Endpoint behavior, authorization, and response shapes reflect the current Express implementation.",
  },
  servers: [{ url: "/", description: "This backend's current origin; no production host is assumed." }],
  tags: [
    "Health", "Authentication", "Industries", "Service Categories", "Organizations",
    "Provider", "Marketplace", "Admin", "Assets", "Maintenance Plans",
    "Service Requests", "Quotes", "Messages", "Contracts", "Work Orders",
    "Invoices", "Payments", "Notifications", "Support", "Reviews", "Attachments",
  ].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Supply the accessToken returned by POST /api/v1/auth/login." },
    },
    schemas,
  },
};
