import jwt from "jsonwebtoken";

// Middleware: only lets the request through if it has a valid token
export function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Checks the signature with our shared secret and the expiry time
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      email: decoded.email,
      name: decoded.name || "",
      image: decoded.image || "",
    };
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
}
