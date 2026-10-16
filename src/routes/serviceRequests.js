const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase6Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listRequests);
router.post("/", controller.createRequest);
router.get("/:requestId/quotes", controller.listQuotes);
router.post("/:requestId/quotes", controller.createQuote);
router.get("/:requestId/messages", controller.listMessages);
router.post("/:requestId/messages", controller.createMessage);
router.get("/:id", controller.getRequest);
router.patch("/:id", controller.patchRequest);
router.delete("/:id", controller.cancelRequest);

module.exports = router;
