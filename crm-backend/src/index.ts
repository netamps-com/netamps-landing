import { onRequest } from 'firebase-functions/v2/https';
import app from './server'; // Import the Express app

// Export the Express API as a Firebase Cloud Function (v2)
// This makes the entire Express backend Serverless and SOC 2 compatible,
// running securely on Google Cloud Run via Firebase.
export const api = onRequest(
  {
    memory: "1GiB",
    timeoutSeconds: 60,
    region: "us-central1", // Or your preferred SOC 2 compliance region
    minInstances: 1,       // Prevent cold starts for critical transactions
    maxInstances: 50,      // Autoscaling boundary
  },
  app
);
