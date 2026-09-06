import Razorpay from 'razorpay';

let razorpay;

const getRazorpay = () => {
  if (!razorpay) {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error(
        "Missing Razorpay credentials. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment variables."
      );
    }

    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

export default getRazorpay;