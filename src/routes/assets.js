const express = require("express");
const authenticate = require("../middleware/authenticate");
const assets = require("../controllers/assetController");
const plans = require("../controllers/maintenancePlanController");

const router = express.Router();

router.use(authenticate);
router.get("/", assets.list);
router.post("/", assets.create);
router.get("/:id/maintenance-plans", plans.listForAsset);
router.post("/:id/maintenance-plans", plans.createForAsset);
router.get("/:id", assets.get);
router.patch("/:id", assets.patch);
router.delete("/:id", assets.retire);

module.exports = router;
