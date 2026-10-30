/**
 * storage.service.js — armazenamento de arquivos em S3 COMPATÍVEL.
 *
 * Hoje aponta para o MinIO (docker compose, rede interna). Migrar para a AWS = só trocar as variáveis
 * (sem mudar código): deixe S3_ENDPOINT vazio, S3_FORCE_PATH_STYLE=false, S3_REGION real e as chaves da AWS/IAM.
 *
 * Os arquivos NÃO ficam públicos: o bucket é privado e o download passa pela API (que confere login e conta).
 * Chave dos objetos: accounts/<account_id>/<pasta>/<id>/<arquivo> — um prefixo por escritório.
 */
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand,
} = require('@aws-sdk/client-s3');

let _client = null;
let _ready = false;

function config() {
  return {
    endpoint: process.env.S3_ENDPOINT || undefined,                 // vazio = AWS
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'foro-arquivos',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true', // MinIO precisa; AWS não
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket);
}

function client() {
  if (_client) return _client;
  const c = config();
  _client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    // Compatibilidade com MinIO/S3 simulados: só calcula checksum quando a operação exige.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return _client;
}

/** Garante que o bucket existe (cria se não existir). Chamado no boot e de forma preguiçosa no 1º upload. */
async function ensureBucket() {
  if (!isConfigured()) throw new Error('Armazenamento S3 não configurado (S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET).');
  if (_ready) return;
  const { bucket } = config();
  try {
    await client().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    const code = err?.$metadata?.httpStatusCode;
    if (code === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchBucket') {
      await client().send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[storage] bucket "${bucket}" criado.`);
    } else {
      throw err;
    }
  }
  _ready = true;
}

/** Sobe um arquivo. metadata = pares string→string (ficam como x-amz-meta-*; sem acentos). */
async function putObject(key, body, { contentType = 'application/octet-stream', metadata = {} } = {}) {
  await ensureBucket();
  const meta = {};
  for (const [k, v] of Object.entries(metadata)) meta[k] = String(v ?? '').normalize('NFD').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
  await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: body, ContentType: contentType, Metadata: meta }));
  return { bucket: config().bucket, key };
}

/** Devolve { stream, contentType, contentLength } de um objeto. */
async function getObject(key) {
  await ensureBucket();
  const r = await client().send(new GetObjectCommand({ Bucket: config().bucket, Key: key }));
  return { stream: r.Body, contentType: r.ContentType, contentLength: r.ContentLength };
}

async function deleteObject(key) {
  await ensureBucket();
  await client().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key }));
}

/** Para o boot e o /health: tenta falar com o S3 sem derrubar a API. */
async function check() {
  if (!isConfigured()) return { ok: false, reason: 'não configurado' };
  try { await ensureBucket(); return { ok: true, bucket: config().bucket, endpoint: config().endpoint || 'aws' }; }
  catch (err) { return { ok: false, reason: err.message }; }
}

module.exports = { isConfigured, ensureBucket, putObject, getObject, deleteObject, check, config };
