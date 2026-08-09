import QRCode from "qrcode";

/**
 * Generates a Data URL (base64) QR Code from a given ticketCode.
 * Format: ZUNO:<ticketCode>
 * 
 * @param {string} ticketCode - The unique ticket code to encode.
 * @returns {Promise<string>} - A promise that resolves to the Data URL string.
 */
export const generateQRCode = async (ticketCode) => {
  if (!ticketCode) {
    throw new Error("Ticket code is required for QR generation.");
  }
  
  const payload = `ZUNO:${ticketCode}`;
  
  try {
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 250,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (error) {
    console.error("QR Generation Error:", error);
    throw new Error("Failed to generate QR code.");
  }
};
