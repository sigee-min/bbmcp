export const hashTextToInt = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
};

export const hashTextToHex = (value: string): string => hashTextToInt(value).toString(16);


