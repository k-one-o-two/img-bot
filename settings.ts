import dotenv from "dotenv";
dotenv.config();

export interface Settings {
  token: string;
  adminGroup: string;
  photoChannel: string;
  phone: string;
  phoneCode: string;
  password: string;
  apiId: string;
  apiHash: string;
  uri: string;
  interval: number;
}

export const settings: Settings = {
  token: process.env.TOKEN as string,
  adminGroup: process.env.ADMIN_GROUP_ID as string,
  photoChannel: process.env.PHOTO_CHANNEL as string,
  phone: process.env.PHONE as string,
  phoneCode: process.env.P_CODE as string,
  password: process.env.PASS as string,
  apiId: process.env.API_ID as string,
  apiHash: process.env.API_HASH as string,
  uri: process.env.URI as string,

  interval: 1000 * 60 * 10,
  // interval: 1000 * 60 * 30,
};
