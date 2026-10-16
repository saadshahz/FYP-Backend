function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const message = status === 500 ? "Internal server error" : error.message;

  if (status === 500) {
    console.error("An unexpected request error occurred.");
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
