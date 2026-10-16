const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase7Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listContracts);
router.post("/", controller.createContract);
router.post("/:contractId/work-orders", controller.createWorkOrder);
router.get("/:id", controller.getContract);
router.patch("/:id", controller.patchContract);
router.post("/:id/send", controller.sendContract);
router.post("/:id/accept", controller.acceptContract);
router.post("/:id/activate", controller.activateContract);
router.post("/:id/complete", controller.completeContract);
router.post("/:id/cancel", controller.cancelContract);

module.exports = router;
