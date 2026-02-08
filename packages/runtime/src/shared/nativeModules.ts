export type NativeModuleOptions = {
  message?: string;
  detail?: string;
  optional?: boolean;
};

type NativeModuleLoader = (name: string, options?: NativeModuleOptions) => unknown;

declare const requireNativeModule: NativeModuleLoader | undefined;
declare const require: ((name: string) => unknown) | undefined;

export const loadNativeModule = <T>(name: string, options?: NativeModuleOptions): T | null => {
  if (typeof requireNativeModule === 'function') {
    try {
      const mod = requireNativeModule(name, options);
      if (mod) return mod as T;
    } catch (_err) {
      // fall through
    }
  }
  if (typeof require === 'function') {
    try {
      return require(name) as T;
    } catch (_err) {
      return null;
    }
  }
  return null;
};
