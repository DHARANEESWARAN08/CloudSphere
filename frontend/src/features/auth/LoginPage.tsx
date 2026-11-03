import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api-client';
import Brand from '@/components/common/Brand';

const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
const createAccountSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120, 'Name must be 120 characters or fewer'),
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address').max(320),
  organization_name: z.string().trim().min(2, 'Enter your organization name').max(120, 'Organization name must be 120 characters or fewer'),
  password: z.string().min(12, 'Use at least 12 characters').max(200, 'Password must be 200 characters or fewer'),
  confirm_password: z.string().min(1, 'Confirm your password'),
}).refine((values) => values.password === values.confirm_password, {
  path: ['confirm_password'],
  message: 'Passwords do not match',
});

type SignInValues = z.infer<typeof signInSchema>;
type CreateAccountValues = z.infer<typeof createAccountSchema>;

export default function LoginPage() {
  const { login, registerAccount, user, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (status === 'authenticated' && user) return <Navigate to={from} replace />;

  const onSignIn: SubmitHandler<SignInValues> = async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) setServerError('Incorrect email or password.');
        else if (error.isNotImplemented) setServerError('The sign-in service is not available yet on the backend.');
        else setServerError(error.message);
      } else {
        setServerError('Sign-in failed. Please try again.');
      }
    }
  };

  const onCreateAccount: SubmitHandler<CreateAccountValues> = async ({ confirm_password: _confirmPassword, ...values }) => {
    setServerError(null);
    try {
      await registerAccount(values);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) setServerError(error.message);
      else setServerError('Account creation failed. Please try again.');
    }
  };

  const switchMode = (nextMode: 'signin' | 'register') => {
    setServerError(null);
    setMode(nextMode);
  };

  return (
    <main className="cs-auth">
      <section className="cs-card cs-auth-card" aria-labelledby="auth-title">
        <div className="text-center mb-4">
          <Brand className="cs-login-wordmark" />
          <h1 id="auth-title" className="h4 mb-1">
            {mode === 'signin' ? 'Sign in to CloudSphere' : 'Create your account'}
          </h1>
          <p className="text-muted small mb-0">Academic cloud-management simulation</p>
          {mode === 'signin' && import.meta.env.DEV && (
            <p className="small text-muted mt-2 mb-0">
              Demo account: <strong>alice@acme.test</strong> · password <strong>Demo@12345</strong>
            </p>
          )}
        </div>

        {serverError && <div className="alert alert-danger py-2 small" role="alert">{serverError}</div>}

        {mode === 'signin' ? (
          <SignInForm onSubmit={onSignIn} />
        ) : (
          <CreateAccountForm onSubmit={onCreateAccount} />
        )}

        <div className="text-center mt-4 small">
          {mode === 'signin' ? (
            <>
              <span className="text-muted">New to CloudSphere? </span>
              <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              <span className="text-muted">Already have an account? </span>
              <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function SignInForm({ onSubmit }: { onSubmit: SubmitHandler<SignInValues> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-3">
        <label htmlFor="email" className="form-label">Email</label>
        <input id="email" type="email" autoComplete="username" className={`form-control ${errors.email ? 'is-invalid' : ''}`} aria-describedby="email-error" {...register('email')} />
        <div id="email-error" className="invalid-feedback">{errors.email?.message}</div>
      </div>
      <div className="mb-4">
        <label htmlFor="password" className="form-label">Password</label>
        <input id="password" type="password" autoComplete="current-password" className={`form-control ${errors.password ? 'is-invalid' : ''}`} aria-describedby="password-error" {...register('password')} />
        <div id="password-error" className="invalid-feedback">{errors.password?.message}</div>
      </div>
      <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function CreateAccountForm({ onSubmit }: { onSubmit: SubmitHandler<CreateAccountValues> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-3">
        <label htmlFor="full-name" className="form-label">Full name</label>
        <input id="full-name" type="text" autoComplete="name" className={`form-control ${errors.full_name ? 'is-invalid' : ''}`} aria-describedby="full-name-error" {...register('full_name')} />
        <div id="full-name-error" className="invalid-feedback">{errors.full_name?.message}</div>
      </div>
      <div className="mb-3">
        <label htmlFor="register-email" className="form-label">Work email</label>
        <input id="register-email" type="email" autoComplete="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} aria-describedby="register-email-error" {...register('email')} />
        <div id="register-email-error" className="invalid-feedback">{errors.email?.message}</div>
      </div>
      <div className="mb-3">
        <label htmlFor="organization-name" className="form-label">Organization</label>
        <input id="organization-name" type="text" autoComplete="organization" className={`form-control ${errors.organization_name ? 'is-invalid' : ''}`} aria-describedby="organization-name-error" {...register('organization_name')} />
        <div id="organization-name-error" className="invalid-feedback">{errors.organization_name?.message}</div>
      </div>
      <div className="mb-3">
        <label htmlFor="register-password" className="form-label">Password</label>
        <input id="register-password" type="password" autoComplete="new-password" className={`form-control ${errors.password ? 'is-invalid' : ''}`} aria-describedby="register-password-error" {...register('password')} />
        <div id="register-password-error" className="invalid-feedback">{errors.password?.message}</div>
        <div className="form-text">Use at least 12 characters.</div>
      </div>
      <div className="mb-4">
        <label htmlFor="confirm-password" className="form-label">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" className={`form-control ${errors.confirm_password ? 'is-invalid' : ''}`} aria-describedby="confirm-password-error" {...register('confirm_password')} />
        <div id="confirm-password-error" className="invalid-feedback">{errors.confirm_password?.message}</div>
      </div>
      <p className="small text-muted">Your organization starts on the Basic plan.</p>
      <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
