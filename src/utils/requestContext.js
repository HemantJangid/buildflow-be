import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage instance used to thread HTTP request context (user, IP)
 * through Mongoose hooks without needing to pass req explicitly.
 *
 * Set in the protect() auth middleware via requestContext.run({ user, ip }, next).
 * Read in auditPlugin hooks via requestContext.getStore().
 */
export const requestContext = new AsyncLocalStorage();
