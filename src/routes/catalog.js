const express = require("express");
const controller = require("../controllers/catalogController");

const router = express.Router();

router.get("/industries", controller.getIndustries);
router.get("/service-categories", controller.getServiceCategories);

module.exports = router;
