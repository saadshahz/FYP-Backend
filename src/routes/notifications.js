const express = require("express");
const authenticate = require("../middleware/authenticate");
const controller = require("../controllers/phase9Controller");

const router = express.Router();

router.use(authenticate);
router.get("/", controller.listNotifications);
router.get("/unread-count", controller.unreadCount);
router.post("/read-all", controller.markAllNotificationsRead);
router.get("/:id", controller.getNotification);
router.post("/:id/read", controller.markNotificationRead);

module.exports = router;
