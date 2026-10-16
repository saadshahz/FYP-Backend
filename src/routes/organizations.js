const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/organizationController");

const router = express.Router();

router.get("/me", authenticate, controller.getMe);
router.patch("/me", authenticate, controller.patchMe);

module.exports = router;
