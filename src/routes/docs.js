const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapi = require("../../docs/openapi");

const router = express.Router();

router.get("/openapi.json", (req, res) => res.json(openapi));
router.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    explorer: true,
    customSiteTitle: "FYP Backend API Docs",
    swaggerOptions: { persistAuthorization: false },
  })
);

module.exports = router;
