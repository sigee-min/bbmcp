export const registerAsync = (promise: Promise<unknown>) => {
  const globalState = globalThis as { __ashfox_test_promises?: Promise<unknown>[] };
  if (!Array.isArray(globalState.__ashfox_test_promises)) {
    globalState.__ashfox_test_promises = [];
  }
  globalState.__ashfox_test_promises.push(promise);
};
