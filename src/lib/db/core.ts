import pg from "pg";

const PAGE_SIZE = 24;

const sanitizeText = (s: string) => s.replace(/\u0000/g, "");

const SUPABASE_CA = `-----BEGIN CERTIFICATE-----
MIID5jCCAs6gAwIBAgIUecmTKYbqO5NLdhTHbdxW6e8/x0wwDQYJKoZIhvcNAQEL
BQAwczELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEmMCQGA1UEAwwdU3VwYWJh
c2UgSW50ZXJtZWRpYXRlIDIwMjEgQ0EwHhcNMjUwMzEyMTU1NjMzWhcNMzAwMzEx
MTU1NjMzWjBrMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRGVsd2FyZTETMBEGA1UE
BwwKTmV3IENhc3RsZTEVMBMGA1UECgwMU3VwYWJhc2UgSW5jMR4wHAYDVQQDDBUq
LnBvb2xlci5zdXBhYmFzZS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQC7m1IrJFRAESxSs16T65DLluFJ5qyr//Xs6Bh/lJDPZjWwJWkPAOuudZcz
S5O3i+PR9ZGNtZZbGyqJHWriJtuo7OLc+yuZ3iTj4Rv09w5yZlghBE+8f+6aszDn
uEHQi1mk9FKQDljpJhsajZ/4hEDfcMrRUNdzDdZaRgRlssAWEsG5iybt3+DqKBp6
mE5Ume0QXGo+GLtTT3rZYxchieZOa9GF1gb/DtoQ+Z3YUL+qU+fqKVHUtKyoIQAj
HLRlRuMBlQiiMVBspSHHOny7K3fybcFh2tP+HYgKzlEItrW1lRCWg5F/BHQsjpWZ
fKrsQaAdRaih4rQI4rDdQfV1oMBdAgMBAAGjejB4MDYGA1UdEQQvMC2CFSoucG9v
bGVyLnN1cGFiYXNlLmNvbYIUKi5wb29sZXIuc3VwYWJhc2UuY28wHQYDVR0OBBYE
FDJ28o4g7/iN/qmYDQXmrVq/tRo+MB8GA1UdIwQYMBaAFBWgUy69cn1i/5Amvr8Y
lfRnRUD6MA0GCSqGSIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDvzCCAqegAwIBAgIUBhalAwMQ7BA1NH7td4msPPwxHzowDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIzMTAyNDA3NTM0NVoXDTMzMTAyMTA3NTM0NVow
czELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEmMCQGA1UEAwwdU3VwYWJhc2Ug
SW50ZXJtZWRpYXRlIDIwMjEgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDOAMhXirH+EGIn8GaDp8T53rEogf7kM8OKW2uQ5yU/wxPa+w8BXgTzWy3W
JDAUhZE78oUtAd9kk5zKPrLXoT3W61PPnOc/9dceL5gB7/78m7EKCySziAA2c8vR
fnYPfznedDXi2lryttSYmMf2qbZDErAxwJDUm6cyq+HLAfb2qUH28u6jP8I9GDtG
PkQnjqtiRXEKjbTc/ntqCQrhtFK02mHkMSju7nEpkNYryunv5n/c9mrRY9/8GwmP
3uSZz3CQ8yQ/E0f8T9gCca2TcKuTQmW2pQqtHv1MuZ3jfJE5Nr9+Fap5kdzDJtdf
BdKofVNZlnYIru5yhUZywY3xYFfHAgMBAAGjUzBRMB0GA1UdDgQWBBQVoFMuvXJ9
Yv+QJr6/GJX0Z0VA+jAfBgNVHSMEGDAWgBSo17l2N9gs7ZISJp4OMiTVLWlGLDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAwdx0XJRHTf/crGpsr
n07uRziGSswWWTe+kDATMQeRZAEW3grVki5LDzs+JLbVIJYhRXFRXkqTRJdSGAgH
/0LNw7GDUwKOLnIRoYR3ILqSFZbkXbrYQ4Yir5yQZWgiNhRNfpEnMMIEQEZoSuFn
8Uh6M4HNfVuwBPgV0/gvKEja3DjJgwPAYzoXvKh5m3fKTt2c22YcTDdZTUDfrst6
Vpt/M03FY6D+897yfNR+nEzeEwjzHMZkperTwVfmBdyXIgIWexQ/whoky7+I4pjz
eLtkPBlwE3WB9fGZVjZqdUNSasS8mmWIyxHPttTzTHHmElDw2OQ/s9HjfCxJztk2
VCgJ
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const host = process.env.POSTGRES_HOST;
    const database = process.env.POSTGRES_DATABASE;
    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;
    if (!host || !database || !user || !password) {
      throw new Error("Missing required PG env vars: POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD");
    }
    pool = new pg.Pool({
      host,
      port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
      database,
      user,
      password,
      ssl: {
        rejectUnauthorized: false,
        ca: process.env.POSTGRES_CA ?? SUPABASE_CA,
      },
      max: 10,
    });
    pool.on("error", (err) => {
      console.error("Unexpected PostgreSQL pool error:", err);
    });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function queryOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  return client.query(text, params);
}

export async function fetchAllOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  const { rows } = await queryOnClient(client, text, params);
  return rows ?? [];
}

export async function fetchOneOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  const rows = await fetchAllOnClient(client, text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await queryOnClient(client, "BEGIN");
    const result = await fn(client);
    await queryOnClient(client, "COMMIT");
    return result;
  } catch (e) {
    await queryOnClient(client, "ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function fetchAll(text: string, params?: unknown[]) {
  const { rows } = await query(text, params);
  return rows ?? [];
}

export async function fetchOne(text: string, params?: unknown[]) {
  const rows = await fetchAll(text, params);
  return rows[0] ?? null;
}

function isShipOwner(row: { discord_id: string | null; submitted_by: string }, { id, username }: { id: string; username: string }): boolean {
  if (row.discord_id) return row.discord_id === id;
  return row.submitted_by === username;
}

function isCollectionOwner(row: { discord_id: string | null; owner: string }, { id, username }: { id: string; username: string }): boolean {
  if (row.discord_id) return row.discord_id === id;
  return row.owner === username;
}

export { sanitizeText, PAGE_SIZE, isShipOwner, isCollectionOwner };