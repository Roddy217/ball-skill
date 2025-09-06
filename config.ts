// Ball-Skill/config.ts
const RAW_SERVER =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.EXPO_PUBLIC_SERVER_URL) ||
  'http://192.168.1.244:3001';

// Important: include /api because screens call API_URL + "/events"
export const API_URL = `${RAW_SERVER}/api`;