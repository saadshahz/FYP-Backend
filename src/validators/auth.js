const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRegistration(body) {
  if (!isObject(body)) {
    return { error: "A JSON object is required." };
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const organizationName =
    typeof body.organizationName === "string" ? body.organizationName.trim() : "";
  const organizationType =
    typeof body.organizationType === "string" ? body.organizationType.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;

  if (!firstName || firstName.length > 100) {
    return { error: "firstName is required and must be at most 100 characters." };
  }
  if (lastName !== null && lastName.length > 100) {
    return { error: "lastName must be at most 100 characters." };
  }
  if (!email || email.length > 255 || !emailPattern.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    Buffer.byteLength(body.password, "utf8") > 72
  ) {
    return { error: "password must be at least 8 characters and at most 72 bytes." };
  }
  if (!organizationName || organizationName.length > 200) {
    return { error: "organizationName is required and must be at most 200 characters." };
  }
  if (!["consumer", "provider"].includes(organizationType)) {
    return { error: "organizationType must be consumer or provider." };
  }
  if (phone !== null && phone.length > 30) {
    return { error: "phone must be at most 30 characters." };
  }

  return {
    value: {
      firstName,
      lastName: lastName || null,
      email,
      password: body.password,
      organizationName,
      organizationType,
      phone: phone || null,
    },
  };
}

function validateLogin(body) {
  if (!isObject(body)) {
    return { error: "A JSON object is required." };
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 255 || !emailPattern.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (typeof body.password !== "string" || body.password.length === 0) {
    return { error: "password is required." };
  }

  return { value: { email, password: body.password } };
}

module.exports = { validateRegistration, validateLogin };
