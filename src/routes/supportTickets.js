const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase9Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listTickets);
router.post("/", controller.createTicket);
router.get("/:id/messages", controller.listTicketMessages);
router.post("/:id/messages", controller.createTicketMessage);
router.post("/:id/resolve", controller.resolveTicket);
router.post("/:id/close", controller.closeTicket);
router.post("/:id/reopen", controller.reopenTicket);
router.get("/:id", controller.getTicket);
router.patch("/:id", controller.patchTicket);

module.exports = router;
