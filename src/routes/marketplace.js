const express = require("express");
const controller = require("../controllers/marketplaceController");

const router = express.Router();

router.get("/providers", controller.listProviders);
router.get("/providers/:id", controller.getProvider);

module.exports = router;
