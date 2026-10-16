const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/maintenancePlanController");

const router = express.Router();

router.use(authenticate);
router.patch("/:id", controller.patch);
router.delete("/:id", controller.deactivate);

module.exports = router;
