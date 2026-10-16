const express = require("express");
const { pool } = require("../config/database");
const authRoutes = require("./auth");
const assetRoutes = require("./assets");
const adminRoutes = require("./admin");
const catalogRoutes = require("./catalog");
const marketplaceRoutes = require("./marketplace");
const organizationRoutes = require("./organizations");
const maintenancePlanRoutes = require("./maintenancePlans");
const providerRoutes = require("./provider");
const serviceRequestRoutes = require("./serviceRequests");
const quoteRoutes = require("./quotes");
const contractRoutes = require("./contracts");
const workOrderRoutes = require("./workOrders");
const invoiceRoutes = require("./invoices");
const paymentRoutes = require("./payments");
const notificationRoutes = require("./notifications");
const supportTicketRoutes = require("./supportTickets");
const reviewRoutes = require("./reviews");
const attachmentRoutes = require("./attachments");

const router = express.Router();

async function healthCheck(req, res) {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", database: "ok" });
  } catch {
    console.error("Database health check failed.");
    res.status(503).json({ status: "error", database: "unavailable" });
  }
}

router.get(["/health", "/v1/health"], healthCheck);
router.use("/v1/auth", authRoutes);
router.use("/v1", catalogRoutes);
router.use("/v1/assets", assetRoutes);
router.use("/v1/maintenance-plans", maintenancePlanRoutes);
router.use("/v1/organizations", organizationRoutes);
router.use("/v1/provider", providerRoutes);
router.use("/v1/requests", serviceRequestRoutes);
router.use("/v1/quotes", quoteRoutes);
router.use("/v1/contracts", contractRoutes);
router.use("/v1/work-orders", workOrderRoutes);
router.use("/v1/invoices", invoiceRoutes);
router.use("/v1/payments", paymentRoutes);
router.use("/v1/notifications", notificationRoutes);
router.use("/v1/support/tickets", supportTicketRoutes);
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/attachments", attachmentRoutes);
router.use("/v1/marketplace", marketplaceRoutes);
router.use("/v1/admin", adminRoutes);

module.exports = router;
