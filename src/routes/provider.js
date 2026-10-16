const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/providerController");
const phase6Controller = require("../controllers/phase6Controller");

const router = express.Router();

router.get("/profile", authenticate, controller.getProfile);
router.patch("/profile", authenticate, controller.patchProfile);
router.get("/services", authenticate, controller.getServices);
router.post("/services", authenticate, controller.createService);
router.patch("/services/:id", authenticate, controller.patchService);
router.delete("/services/:id", authenticate, controller.deleteService);
router.get("/requests", authenticate, phase6Controller.discoverRequests);

module.exports = router;
