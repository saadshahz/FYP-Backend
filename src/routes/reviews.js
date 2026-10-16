const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase9Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listReviews);
router.post("/", controller.createReview);
router.get("/:id", controller.getReview);
router.patch("/:id", controller.patchReview);

module.exports = router;
