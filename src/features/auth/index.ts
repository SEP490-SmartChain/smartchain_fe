/**
 * Public API của feature `auth`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { RegisterBusinessForm } from './components/RegisterBusinessForm';
export { useRegisterBusiness } from './hooks/useRegisterBusiness';
export { useEmailVerification } from './hooks/useEmailVerification';
export { getRegisterSchema, type RegisterFormData } from './schemas/register.schema';

