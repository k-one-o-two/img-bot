import dotenv from "dotenv";
dotenv.config();

export const settings = {
  token: process.env.TOKEN,
  adminGroup: process.env.ADMIN_GROUP_ID,
  photoChannel: process.env.PHOTO_CHANNEL,
  phone: process.env.PHONE,
  phoneCode: process.env.P_CODE,
  password: process.env.PASS,
  apiId: process.env.API_ID,
  apiHash: process.env.API_HASH,
  uri: process.env.URI,

  interval: 1000 * 10,
  // interval: 1000 * 60 * 30,
};
