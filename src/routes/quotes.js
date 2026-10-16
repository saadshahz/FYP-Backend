const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase6Controller");

const router = express.Router();

router.use(authenticate);
router.get("/:quoteId", controller.getQuote);
router.patch("/:quoteId", controller.patchQuote);
router.post("/:quoteId/submit", controller.submitQuote);
router.post("/:quoteId/accept", controller.decideQuote("accepted"));
router.post("/:quoteId/reject", controller.decideQuote("rejected"));

module.exports = router;
