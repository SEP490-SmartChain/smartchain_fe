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

export { LoginForm } from './components/LoginForm';

export { ForgotPasswordForm } from './components/ForgotPasswordForm';
export { usePasswordResetRequest } from './hooks/usePasswordResetRequest';
export {
  getForgotPasswordSchema,
  type ForgotPasswordFormData,
} from './schemas/forgotPassword.schema';

export { ResetPasswordForm } from './components/ResetPasswordForm';
export { usePasswordResetConfirm } from './hooks/usePasswordResetConfirm';
export { getResetPasswordSchema, type ResetPasswordFormData } from './schemas/resetPassword.schema';
