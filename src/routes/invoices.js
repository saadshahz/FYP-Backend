const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase8Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listInvoices);
router.post("/", controller.createInvoice);
router.get("/:id/payments", controller.listPayments);
router.post("/:id/payments", controller.createPayment);
router.post("/:id/issue", controller.issueInvoice);
router.post("/:id/cancel", controller.cancelInvoice);
router.get("/:id", controller.getInvoice);
router.patch("/:id", controller.patchInvoice);

module.exports = router;
