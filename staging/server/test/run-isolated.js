'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Retain only OS variables needed to launch Node on supported development
// hosts. Application credentials, endpoints, and deployment flags are dropped
// without reading or printing their values.
const safeHostEnvNames = [
    'PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT',
];
const isolatedEnv = Object.create(null);
for (const name of safeHostEnvNames) {
    if (process.env[name] !== undefined) isolatedEnv[name] = process.env[name];
}
Object.assign(isolatedEnv, {
    NODE_ENV: 'test',
    SESSION_COOKIE_AUTH_ENABLED: 'false',
    SESSION_BEARER_CUTOFF_AT: '',
    SESSION_BEARER_CUTOFF_ENFORCED: 'false',
    SCANNER_SESSION_SECRET: 'test-only-session-secret-with-more-than-32-characters',
    SCANNER_PASSWORD: 'test-scanner-password-123',
    SCANNER_EVENT_NAMES: 'DHOLIDA GARBA ROYALE',
    SCANNER_COMPANY_ID: 'littlane',
    RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
    PRESENTATION_KEY: 'test-presentation-secret',
    ADMIN_KEY: 'test-legacy-admin-key',
    PORTAL_ADMIN_KEY: 'test-portal-admin-key',
    BOOKING_OTP_SECRET: 'test-only-booking-otp-secret-with-more-than-32-characters',
    LITTX_MOCK_SALES_FILE: path.join(os.tmpdir(), 'littx-isolated-test-sales-' + process.pid + '.json'),
});

const testFiles = fs.readdirSync(__dirname)
    .filter(name => name.endsWith('.test.js'))
    .map(name => path.join(__dirname, name));

const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...testFiles], {
    cwd: path.resolve(__dirname, '..'),
    env: isolatedEnv,
    stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
