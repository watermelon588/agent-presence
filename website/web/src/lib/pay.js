// Every payment link lives here, filled from .env (see .env.example). Empty = a "coming soon" modal.
export const PAY = {
  sponsorUrl: import.meta.env.VITE_SPONSOR_URL || '',
  coffeeUrl: import.meta.env.VITE_COFFEE_URL || '',
};
