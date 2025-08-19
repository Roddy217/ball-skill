import { Stripe } from '@stripe/stripe-react-native';

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_your_publishable_key'; // Replace with your actual Stripe publishable key
export const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

export const initPaymentSheet = async (paymentIntentClientSecret) => {
  await stripe.initPaymentSheet({
    paymentIntentClientSecret,
    merchantDisplayName: 'Ball Skill',
  });
};

export const presentPaymentSheet = async () => {
  const { error } = await stripe.presentPaymentSheet();
  if (error) throw error;
  return true;
};
