import { createRemoteJWKSet, jwtVerify } from "jose";

// The client's public keys. jose downloads them once and caches them.
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// Middleware: only lets the request through if it has a valid token
export async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS);
    // Attach the verified user to the request for the route to use
    req.user = {
      email: payload.email,
      name: payload.name || "",
      image: payload.image || "",
    };
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
}
