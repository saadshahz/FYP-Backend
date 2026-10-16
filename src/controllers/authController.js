const authService = require("../services/authService");
const { validateLogin, validateRegistration } = require("../validators/auth");

async function register(req, res, next) {
  const validation = validateRegistration(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const registration = await authService.register(validation.value);
    if (!registration) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return res.status(201).json(registration);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  const validation = validateLogin(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const result = await authService.login(validation.value.email, validation.value.password);
    if (!result) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const profile = await authService.getProfile(req.auth.userId);
    if (!profile) {
      return res.status(401).json({ error: "Invalid or inactive account." });
    }
    return res.status(200).json({ user: profile });
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, me, register };
