import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  secretaryName: process.env.SECRETARY_NAME || 'Sofia',
  companyName: process.env.COMPANY_NAME || 'Studio Bella - Gestão & Estética',
  companyDescription: process.env.COMPANY_DESCRIPTION || 'Salão de beleza completo: Cabelos, Cortes, Manicures e Bronzeamento.',
  workingHours: process.env.WORKING_HOURS || 'Segunda a Sábado das 09:00 às 19:00',
  address: process.env.ADDRESS || 'Rua das Flores, 123 - Jardins, São Paulo - SP',
  adminPhone: process.env.ADMIN_PHONE || '5511958527119',
  allowedPhoneNumbers: (process.env.ALLOWED_PHONE_NUMBERS || '')
    .split(',')
    .map(n => n.trim().replace(/\D/g, ''))
    .filter(Boolean),
  dataPath: path.resolve(process.cwd(), 'data', 'database.json'),
  authInfoPath: path.resolve(process.cwd(), 'auth_info_baileys'),
  portalAuthInfoPath: path.resolve(process.cwd(), 'auth_info_portal'),
};
