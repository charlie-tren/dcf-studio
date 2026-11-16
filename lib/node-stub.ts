// yahoo-finance2's import.meta polyfill imports these Node built-ins; the browser never calls them.
const unavailable = () => {
  throw new Error('Node built-in unavailable in the browser');
};
export const createRequire = unavailable;
export const fileURLToPath = unavailable;
export const pathToFileURL = unavailable;
export const dirname = unavailable;
