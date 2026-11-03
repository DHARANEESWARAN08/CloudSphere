import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { cookie, createSession, newCsrfToken, requireAuth, requireCsrf } from '../../middleware/auth.js';

const router = Router();
const loginSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(200) });
const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).toLowerCase(),
  organization_name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
});
const publicUser = (u) => ({ user_id: u.user_id, email: u.email, full_name: u.full_name, role: u.role, organization_id: u.organization_id });

router.get('/csrf', (req, res) => {
  const token = newCsrfToken();
  res.setHeader('Set-Cookie', cookie('cloudsphere_csrf', token, { httpOnly: false, maxAge: 28_800 }));
  res.json({ data: { csrf_token: token } });
});
router.post('/register', requireCsrf, async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter your name, a valid email, an organization, and a password with at least 12 characters.' } });
  }

  const { full_name, email, organization_name, password } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingEmail = await client.query('SELECT 1 FROM app_user WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (existingEmail.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists. Sign in instead.' } });
    }

    const existingOrganization = await client.query('SELECT 1 FROM organization WHERE lower(name) = lower($1) LIMIT 1', [organization_name]);
    if (existingOrganization.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'ORGANIZATION_EXISTS', message: 'This organization already has an account. Ask its administrator to add you.' } });
    }

    const { rows: plans } = await client.query(
      "SELECT plan_id FROM subscription_plan WHERE name = 'Basic' AND is_active ORDER BY plan_id LIMIT 1",
    );
    if (!plans[0]) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: { code: 'REGISTRATION_UNAVAILABLE', message: 'Registration is unavailable because no active Basic plan is configured.' } });
    }

    const { rows: organizations } = await client.query(
      `INSERT INTO organization (name, subscription_plan_id, billing_email)
       VALUES ($1, $2, $3) RETURNING organization_id`,
      [organization_name, plans[0].plan_id, email],
    );
    const { rows: users } = await client.query(
      `INSERT INTO app_user (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), $4, 'customer')
       RETURNING user_id, email, full_name, role, organization_id`,
      [organizations[0].organization_id, email, password, full_name],
    );

    await client.query('COMMIT');
    res.setHeader('Set-Cookie', cookie('cloudsphere_session', createSession(users[0].user_id)));
    return res.status(201).json({ data: publicUser(users[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      return res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account or organization with these details already exists.' } });
    }
    return next(error);
  } finally {
    client.release();
  }
});
router.post('/login', requireCsrf, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email and password.' } });
    const { email, password } = parsed.data;
    const { rows } = await query(`SELECT u.user_id, u.email, u.full_name, u.role, u.organization_id
      FROM app_user u LEFT JOIN organization o USING (organization_id)
      WHERE lower(u.email) = lower($1) AND u.is_active AND (u.role = 'admin' OR o.status = 'ACTIVE')
        AND u.password_hash = crypt($2, u.password_hash)`, [email, password]);
    if (!rows[0]) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    await query('UPDATE app_user SET last_login_at = now() WHERE user_id = $1', [rows[0].user_id]);
    res.setHeader('Set-Cookie', cookie('cloudsphere_session', createSession(rows[0].user_id)));
    res.json({ data: publicUser(rows[0]) });
  } catch (error) { next(error); }
});
router.get('/me', requireAuth, (req, res) => res.json({ data: publicUser(req.user) }));
router.post('/logout', requireCsrf, (req, res) => {
  res.setHeader('Set-Cookie', [cookie('cloudsphere_session', '', { maxAge: 0 }), cookie('cloudsphere_csrf', '', { httpOnly: false, maxAge: 0 })]);
  res.json({ data: { logged_out: true } });
});
export default router;
