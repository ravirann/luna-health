// R2 signed-URL minting (server-only).
//
// Recordings are uploaded by the pipecat bot (Python boto3) into a private
// R2 bucket. The Next.js app generates short-lived presigned GET URLs on
// demand from /api/recording/:sessionId/url.

import { createHash, createHmac } from 'node:crypto';

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function r2Env(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function hmac(key: Buffer | string, msg: string): Buffer {
  return createHmac('sha256', key).update(msg).digest();
}

function hex(b: Buffer): string {
  return b.toString('hex');
}

/**
 * Mint a presigned GET URL for an R2 object using AWS Signature v4.
 * `r2Uri` is the `r2://bucket/key` value we stored in `sessions.audio_url`.
 *
 * `expiresInSec` defaults to 5 minutes — long enough for the browser to
 * load the audio, short enough to survive a leaked URL.
 */
export function presignR2GetUrl(r2Uri: string, expiresInSec = 300): string | null {
  const env = r2Env();
  if (!env) return null;

  const m = r2Uri.match(/^r2:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, bucket, key] = m;
  if (bucket !== env.bucket) return null;

  const host = `${env.accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${env.accessKeyId}/${credentialScope}`;

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSec),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(params)
    .sort()
    .map(
      (k) =>
        encodeURIComponent(k) + '=' + encodeURIComponent(params[k]).replace(/%2F/g, '%2F'),
    )
    .join('&');

  const encodedKey = key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const canonicalUri = `/${bucket}/${encodedKey}`;

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = hmac('AWS4' + env.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
