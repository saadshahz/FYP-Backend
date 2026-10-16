const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase8Controller");

const router = express.Router();

router.use(authenticate);
router.post("/:id/confirm", controller.confirmPayment);
router.post("/:id/fail", controller.failPayment);
router.post("/:id/refund", controller.refundPayment);
router.get("/:id", controller.getPayment);

module.exports = router;
