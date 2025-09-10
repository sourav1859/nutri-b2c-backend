import type { UserContext } from "../middleware/auth.js";

declare global {
  namespace Express {
    interface User extends UserContext {}
    interface Request {
      user?: UserContext;
    }
  }
}

export {};
