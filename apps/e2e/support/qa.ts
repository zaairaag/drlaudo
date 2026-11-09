import { fileURLToPath } from 'node:url';

export const QA = {
  password: 'Qa@12345',
  staff: { id: '11111111-1111-4111-8111-111111111111', name: 'Equipe QA', email: 'equipe@qa.test' },
  ana: { id: '22222222-2222-4222-8222-222222222222', name: 'Ana QA', email: 'ana@qa.test' },
  bruno: { id: '33333333-3333-4333-8333-333333333333', name: 'Bruno QA', email: 'bruno@qa.test' },
  xray: { id: '44444444-4444-4444-8444-444444444444', code: 'XRAY', name: 'Raio-X de tórax' },
  ultrasound: { id: '55555555-5555-4555-8555-555555555555', code: 'ULTRASOUND', name: 'Ultrassonografia de abdome' },
  mri: { id: '66666666-6666-4666-8666-666666666666', code: 'MRI', name: 'Ressonância de crânio' },
} as const;

export type Identity = 'staff' | 'ana' | 'bruno';
export const SESSION_KEY = 'drlaudo.session';
export const WEB_URL = 'http://127.0.0.1:4183';
export const API_URL = 'http://127.0.0.1:3335';
export const authDirectory = fileURLToPath(new URL('../.auth/', import.meta.url));

export function storageFile(identity: Identity): string {
  return fileURLToPath(new URL(`../.auth/${identity}.json`, import.meta.url));
}
