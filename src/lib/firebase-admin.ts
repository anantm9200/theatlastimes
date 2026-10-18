import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import path from 'node:path';

const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve('firebase-applet-config.json'), 'utf8'));

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : undefined;
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount?.project_id || firebaseConfig.projectId,
    ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
  });
}

export const adminAuth = getAuth();
