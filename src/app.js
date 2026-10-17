const express = require("express");
const routes = require("./routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const docsRoutes = require("./routes/docs");
const cors = require("./middleware/cors");

const app = express();

app.use(cors);
app.use(express.json());
app.use("/api/docs", docsRoutes);
app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
