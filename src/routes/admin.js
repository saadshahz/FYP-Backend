const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const controller = require("../controllers/adminController");

const router = express.Router();

router.patch(
  "/providers/:organizationId/approve",
  authenticate,
  requireAdmin,
  controller.approveProvider
);
router.patch(
  "/providers/:organizationId/reject",
  authenticate,
  requireAdmin,
  controller.rejectProvider
);

module.exports = router;
