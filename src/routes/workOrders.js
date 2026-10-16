const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase7Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listWorkOrders);
router.get("/:id/events", controller.listEvents);
router.post("/:id/assign", controller.assignWorkOrder);
router.post("/:id/start", controller.startWorkOrder);
router.post("/:id/complete", controller.completeWorkOrder);
router.post("/:id/cancel", controller.cancelWorkOrder);
router.get("/:id", controller.getWorkOrder);
router.patch("/:id", controller.patchWorkOrder);

module.exports = router;
