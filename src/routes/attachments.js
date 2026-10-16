const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase9Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listAttachments);
router.post("/", controller.createAttachment);
router.get("/:id", controller.getAttachment);
router.delete("/:id", controller.deleteAttachment);

module.exports = router;
