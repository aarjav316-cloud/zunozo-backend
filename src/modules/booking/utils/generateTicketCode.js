import crypto from "crypto";

const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateTicketCode = (length = 8) => {
  const randomBytes = crypto.randomBytes(length);

  let ticketCode = "";

  for (let i = 0; i < length; i++) {
    ticketCode += CHARACTERS[randomBytes[i] % CHARACTERS.length];
  }

  return ticketCode;
};

export default generateTicketCode;
