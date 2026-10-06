import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  secretaryName: process.env.SECRETARY_NAME || 'Sofia',
  companyName: process.env.COMPANY_NAME || 'Consultoria & Atendimento Virtual',
  companyDescription: process.env.COMPANY_DESCRIPTION || 'Serviços profissionais e agendamentos personalizados.',
  workingHours: process.env.WORKING_HOURS || 'Segunda a Sexta das 08:00 às 18:00 e Sábado das 08:00 às 12:00',
  address: process.env.ADDRESS || 'Av. Paulista, 1000 - São Paulo, SP',
  adminPhone: process.env.ADMIN_PHONE || '',
  dataPath: path.resolve(process.cwd(), 'data', 'database.json'),
  authInfoPath: path.resolve(process.cwd(), 'auth_info_baileys'),
};
